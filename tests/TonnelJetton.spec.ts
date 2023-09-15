import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {Address, beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {MerkleTree, Sha256} from "../utils/merkleTree";
import {genProofArgs, rbuffer, toBigIntLE} from "../utils/circuit";
import path from "path";
// @ts-ignore
import {groth16} from "snarkjs";
import {JettonMinter} from "../wrappers/JettonMinter";
import {ERRORS, TonnelJetton} from "../wrappers/TonnelJetton";
import {JettonWallet} from "../wrappers/JettonWallet";
import {parseG1Func, parseG2Func} from "./Tonnel.spec";

const wasmPath = path.join(__dirname, "../build/circuits/circuit_v2.wasm");
const zkeyPath = path.join(__dirname, "../build/circuits/circuit_final_v2.zkey");

const fee = 0.02;
const pool_size = 2000;
const deposit_fee = 1.65;
const withdraw_fee = 0.25;

describe('TonnelJetton', () => {
  let code: Cell;
  let codeWallet: Cell;
  let codeMaster: Cell;

  beforeAll(async () => {
    code = await compile('TonnelJetton');
    codeWallet = await compile('JettonWallet');
    codeMaster = await compile('JettonMinter');

  });

  let blockchain: Blockchain;
  let tonnel: SandboxContract<TonnelJetton>;
  let jettonMinter: SandboxContract<JettonMinter>;
  let tonnelJettonMaster: SandboxContract<JettonMinter>;
  let owner: SandboxContract<TreasuryContract>;
  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');
    let owner2 = await blockchain.treasury('owner2');
    jettonMinter = blockchain.openContract(JettonMinter.createFromConfig({
      adminAddress: (await blockchain.treasury('owner')).address,
      content: "",
      jettonWalletCode: codeWallet
    }, codeMaster));
    let deployJettonResult = await jettonMinter.sendDeploy(owner.getSender(), toNano('0.05'));
    expect(deployJettonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: jettonMinter.address,
      deploy: true,
      success: true,
    });

    tonnelJettonMaster = blockchain.openContract(JettonMinter.createFromConfig({
      adminAddress: owner2.address,
      content: "",
      jettonWalletCode: codeWallet
    }, codeMaster));

    deployJettonResult = await tonnelJettonMaster.sendDeploy(owner.getSender(), toNano('0.05'));
    expect(deployJettonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnelJettonMaster.address,
      deploy: true,
      success: true,
    });



    tonnel = blockchain.openContract(
      TonnelJetton.createFromConfig(
        {
          ownerAddress: owner.address,
          jettonMinterAddress: jettonMinter.address,
          jettonWalletBytecode: codeWallet,
          tonnelJettonAddress: tonnelJettonMaster.address,
          relayerTonnelMint: 50,
          depositorTonnelMint: 10
        },
        code
      )
    );

    await tonnelJettonMaster.sendMintAccess(owner2.getSender(),{
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: tonnel.address
    })


    const deployResult = await tonnel.sendDeploy(owner.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      deploy: true,
      success: true,
    });


    const sender = await blockchain.treasury('sender');
    const mintResult = await jettonMinter.sendMint(owner.getSender(), {
      toAddress: sender.address,
      jettonAmount: toNano('10000000'),
      amount: toNano('0.02'),
      queryId: 1,
      value: toNano('0.07')

    });


    expect(mintResult.transactions).toHaveTransaction({
      from: owner.address,
      to: jettonMinter.address,
      success: true,
    });

  });

  async function merkleInitialize() {
    const initSlice = 2;
    for (let i = 0; i < initSlice; i++) {
      console.log(`init ${i + 1}/${initSlice}`);

      const init_account = await blockchain.treasury('increaser' + i);


      const increaseResult = await tonnel.sendContinue(init_account.getSender(), {
        value: toNano('0.8'),
      });
      expect(increaseResult.transactions).toHaveTransaction({
        from: init_account.address,
        to: tonnel.address,
        success: true,
      });




    }
    const changeFee = await tonnel.sendChangeFee(owner.getSender(), {
      value: toNano('0.02'),
      queryID: 0,
      ownerAddress: owner.address,
      relayerTonnelMint: 50,
      depositorTonnelMint: 10,
      tonnelJettonAddress: tonnelJettonMaster.address,
    })

    expect(changeFee.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      success: true,
    });
  }

  it('should init Merkle ', async () => {

    await merkleInitialize();

  });


  it('should init Merkle and then deposit', async () => {
    await merkleInitialize();
    const tree = new MerkleTree(20);
    const rootInit = await tonnel.getLastRoot();
    expect(BigInt(tree.root())).toEqual(rootInit);
    console.log('before', Number(await tonnel.getBalance()) / 1000000000);


    const randomBuf = rbuffer(31);
    const randomBuf2 = rbuffer(31);
    const nullifier = toBigIntLE(randomBuf2);
    const secret = toBigIntLE(randomBuf);
    const commitment = Sha256(secret.toString(), nullifier.toString());


    const sender = await blockchain.treasury('sender');


    const jettonWalletDepositor = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

    const jettonWalletTonnelContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(tonnel.address)))
    const jettonWalletOwner = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner.address)))
    console.log((deposit_fee + 0.07).toFixed(3))
    const depositResult = await jettonWalletDepositor.sendTransfer(sender.getSender(), {
      value: toNano((deposit_fee + 0.07).toFixed(3)),
      toAddress: tonnel.address,
      queryId: 0,
      fwdAmount: toNano(deposit_fee.toFixed(3)),
      jettonAmount: toNano((pool_size + fee * pool_size).toString()),
      fwdPayload: beginCell().storeUint(BigInt(commitment), 256).endCell()
    });

    expect(depositResult.transactions).toHaveTransaction({
      from: jettonWalletDepositor.address,
      to: jettonWalletTonnelContract.address,
      success: true,
    });

    expect(depositResult.transactions).toHaveTransaction({
      from: jettonWalletTonnelContract.address,
      to: jettonWalletOwner.address,
      success: true,
    });


    console.log('before1', Number(await tonnel.getBalance()) / 1000000000);


    expect(depositResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: tonnelJettonMaster.address,
      success: true,
    })
    const jettonWalletDepositorContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await tonnelJettonMaster.getWalletAddress(sender.address)))
    expect(depositResult.transactions).toHaveTransaction({
      from: tonnelJettonMaster.address,
      to: jettonWalletDepositorContract.address,
      success: true,
    })



    expect(await jettonWalletDepositorContract.getBalance()).toEqual(toNano(10))




    expect(await jettonWalletTonnelContract.getBalance()).toEqual(toNano(pool_size))
    tree.insert(commitment);

    const rootAfter = await tonnel.getLastRoot();
    expect(BigInt(tree.root())).toEqual(rootAfter);
    console.log('after', Number(await tonnel.getBalance()) / 1000000000);

  });


  it('should init Merkle and then revert on invalid deposit', async () => {
    await merkleInitialize();
    const tree = new MerkleTree(20);
    const rootInit = await tonnel.getLastRoot();
    expect(BigInt(tree.root())).toEqual(rootInit);
    console.log('before', Number(await tonnel.getBalance()) / 1000000000);

    const sender = await blockchain.treasury('sender');


    const randomBuf = rbuffer(31);
    const randomBuf2 = rbuffer(31);
    const nullifier = toBigIntLE(randomBuf2);
    const secret = toBigIntLE(randomBuf);
    const commitment = Sha256(secret.toString(), nullifier.toString());


    const jettonWalletDepositor = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

    const jettonWalletTonnelContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(tonnel.address)))
    const jettonWalletOwner = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner.address)))
    const previousBalance = await jettonWalletDepositor.getBalance();
    const depositResult = await jettonWalletDepositor.sendTransfer(sender.getSender(), {
      value: toNano((deposit_fee + 0.07).toFixed(3)),
      toAddress: tonnel.address,
      queryId: 2,
      fwdAmount: toNano(deposit_fee.toFixed(3)),
      jettonAmount: toNano((pool_size).toString()), //not paying fee
      fwdPayload: beginCell().storeUint(BigInt(commitment), 256).endCell()
    });

    expect(await jettonWalletTonnelContract.getBalance()).toEqual(toNano("0")) // should not hold users funds in revert scenario
    expect(await jettonWalletDepositor.getBalance()).toEqual(previousBalance) // should not hold users funds in revert scenario
    console.log('after', Number(await tonnel.getBalance()) / 1000000000);


  });

  it('should init Merkle and then deposit twice two person together', async () => {
    // in this scenario we have two users depositing together so we will refund one of them
    await merkleInitialize();
    const tree = new MerkleTree(20);
    const rootInit = await tonnel.getLastRoot();
    expect(BigInt(tree.root())).toEqual(rootInit);
    console.log('before', Number(await tonnel.getBalance()) / 1000000000);

    const sender = await blockchain.treasury('sender');


    const randomBuf = rbuffer(31);
    const randomBuf2 = rbuffer(31);
    const nullifier = toBigIntLE(randomBuf2);
    const secret = toBigIntLE(randomBuf);
    const commitment = Sha256(secret.toString(), nullifier.toString());
    tree.insert(commitment);


    const jettonWalletDepositor = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

    const jettonWalletTonnelContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(tonnel.address)))
    const jettonWalletOwner = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner.address)))
    const previousBalance = await jettonWalletDepositor.getBalance();
    const depositResult1 = await jettonWalletDepositor.sendTransfer(sender.getSender(), {
      value: toNano((deposit_fee + 0.07).toFixed(3)),
      toAddress: tonnel.address,
      queryId: 2,
      fwdAmount: toNano(deposit_fee.toFixed(3)),
      jettonAmount: toNano((pool_size * (1 + fee)).toString()), //not paying fee
      fwdPayload: beginCell().storeUint(BigInt(commitment), 256).endCell()
    });
    console.log('before11', Number(await tonnel.getBalance()) / 1000000000);


    tree.insert(commitment);

    const depositResult2 = await jettonWalletDepositor.sendTransfer(sender.getSender(), {
      value: toNano((deposit_fee + 0.07).toFixed(3)),
      toAddress: tonnel.address,
      queryId: 2,
      fwdAmount: toNano(deposit_fee.toFixed(3)),
      jettonAmount: toNano((pool_size * (1 + fee)).toString()), //not paying fee
      fwdPayload: beginCell().storeUint(BigInt(commitment), 256).endCell()
    });
    console.log('before22', Number(await tonnel.getBalance()) / 1000000000);


    expect(await jettonWalletTonnelContract.getBalance()).toEqual(toNano(2 * pool_size))
    expect(await jettonWalletDepositor.getBalance()).toEqual(previousBalance - 2n * toNano(pool_size * (1 + fee)))


    const rootAfter = await tonnel.getLastRoot();
    expect(BigInt(tree.root())).toEqual(rootAfter);

    expect(depositResult1.transactions).toHaveTransaction({
      from: tonnel.address,
      to: tonnelJettonMaster.address,
      success: true,
    })
    const jettonWalletDepositorContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await tonnelJettonMaster.getWalletAddress(sender.address)))
    expect(depositResult1.transactions).toHaveTransaction({
      from: tonnelJettonMaster.address,
      to: jettonWalletDepositorContract.address,
      success: true,
    })



    expect(await jettonWalletDepositorContract.getBalance()).toEqual(toNano(20))
    console.log('after', Number(await tonnel.getBalance()) / 1000000000);

  });

  it('should init Merkle and then deposit and then withdraw', async () => {
    await merkleInitialize();
    const tree = new MerkleTree(20);
    const rootInit = await tonnel.getLastRoot();
    expect(BigInt(tree.root())).toEqual(rootInit);
    console.log('before', Number(await tonnel.getBalance()) / 1000000000);

    const sender = await blockchain.treasury('sender');
    const cell_address_sender = beginCell().storeAddress(sender.address).endCell();
    const cell_address_owner = beginCell().storeAddress(owner.address).endCell();


    const randomBuf = rbuffer(31);
    const randomBuf2 = rbuffer(31);
    const nullifier = toBigIntLE(randomBuf2);
    const secret = toBigIntLE(randomBuf);
    const commitment = Sha256(secret.toString(), nullifier.toString());


    const jettonWalletDepositor = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

    const jettonWalletTonnelContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(tonnel.address)))
    const jettonWalletOwner = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner.address)))

    const depositResult = await jettonWalletDepositor.sendTransfer(sender.getSender(), {
      value: toNano((deposit_fee + 0.07).toFixed(3)),
      toAddress: tonnel.address,
      queryId: 2,
      fwdAmount: toNano(deposit_fee.toFixed(3)),
      jettonAmount: toNano((pool_size + fee * pool_size).toString()),
      fwdPayload: beginCell().storeUint(BigInt(commitment), 256).endCell()
    });
    console.log(await jettonWalletTonnelContract.getBalance())
    console.log(await jettonWalletDepositor.getBalance())
    console.log(await jettonWalletOwner.getBalance())
    expect(depositResult.transactions).toHaveTransaction({
      from: jettonWalletDepositor.address,
      to: jettonWalletTonnelContract.address,
      success: true,
    });

    expect(depositResult.transactions).toHaveTransaction({
      from: jettonWalletTonnelContract.address,
      to: jettonWalletOwner.address,
      success: true,
    });

    // expect(await jettonWalletTonnelContract.getBalance()).toEqual(toNano(pool_size))


    expect(depositResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: tonnelJettonMaster.address,
      success: true,
    })
    const jettonWalletDepositorContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await tonnelJettonMaster.getWalletAddress(sender.address)))
    expect(depositResult.transactions).toHaveTransaction({
      from: tonnelJettonMaster.address,
      to: jettonWalletDepositorContract.address,
      success: true,
    })

    // expect(await jettonWalletDepositorContract.getBalance()).toEqual(toNano(100))

    tree.insert(commitment);
    const merkleProof = tree.proof(0);
    const rootAfter = await tonnel.getLastRoot();
    expect(BigInt(tree.root())).toEqual(rootAfter);


    const input = {
      root: tree.root(),
      secret: secret.toString(),
      nullifier: nullifier.toString(),
      nullifierHash: Sha256(nullifier.toString(), nullifier.toString()),
      fee: 10,
      recipient: cell_address_sender.beginParse().loadUintBig(256),

      pathElements: merkleProof.pathElements,
      pathIndices: merkleProof.pathIndices,
    };


    let {proof, publicSignals} = await groth16.fullProve(input, wasmPath, zkeyPath);

    const B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    const B_y = proof.pi_b[1].map((num: string) => BigInt(num))


    // for (let i = 0; i < 99; i++) {
    //   const randomBuf = rbuffer(31);
    //   const randomBuf2 = rbuffer(31);
    //   const nullifier = toBigIntLE(randomBuf2);
    //   const secret = toBigIntLE(randomBuf);
    //   const commitment = Sha256(secret.toString(), nullifier.toString());
    //
    //
    //   const jettonWalletDepositor = await blockchain.openContract(
    //     JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))
    //
    //   const jettonWalletTonnelContract = await blockchain.openContract(
    //     JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(tonnel.address)))
    //
    //   const depositResult = await jettonWalletDepositor.sendTransfer(sender.getSender(), {
    //     value: toNano((deposit_fee + 0.07).toFixed(3)),
    //     toAddress: tonnel.address,
    //     queryId: 2,
    //     fwdAmount: toNano(deposit_fee.toFixed(3)),
    //     jettonAmount: toNano((pool_size + fee * pool_size).toString()),
    //     fwdPayload: beginCell().storeUint(BigInt(commitment), 256).endCell()
    //   });
    //
    //   expect(depositResult.transactions).toHaveTransaction({
    //     from: jettonWalletDepositor.address,
    //     to: jettonWalletTonnelContract.address,
    //     success: true,
    //   });
    // }
    // const check_verify = await tonnel.getCheckVerify(beginCell().storeUint(0, 32)
    //     .storeUint(0 ?? 0, 64)
    //     .storeRef(beginCell()
    //     .storeUint(BigInt(publicSignals[0]), 256)
    //     .storeUint(BigInt(publicSignals[1]), 256)
    //     .storeUint(input.fee, 10)
    //     .storeRef(
    //         beginCell().storeAddress(sender.address)
    //             .endCell()
    //     ).storeRef(parseG1Func(proof.pi_a.slice(0, 2).map((num: string) => BigInt(num)))).storeRef(parseG2Func(B_x[0], B_x[1], B_y))
    //     .storeRef(parseG1Func(proof.pi_c.slice(0, 2).map((num: string) => BigInt(num))))
    //     .endCell()).endCell());
    // expect(check_verify).toEqual(1);

    const withdrawResult = await tonnel.sendWithdraw(owner.getSender(), {
      value: toNano((withdraw_fee).toFixed(3)),
      root: BigInt(publicSignals[0]),
      nullifierHash: BigInt(publicSignals[1]),
      recipient: sender.address,
      fee: input.fee,
      a: parseG1Func(proof.pi_a.slice(0, 2).map((num: string) => BigInt(num))),
      b: parseG2Func(B_x[0], B_x[1], B_y),
      c: parseG1Func(proof.pi_c.slice(0, 2).map((num: string) => BigInt(num))),
    });

    expect(withdrawResult.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      success: true,
    });
    expect(withdrawResult.transactions).toHaveTransaction({
      from: jettonWalletTonnelContract.address,
      to: jettonWalletOwner.address,
      success: true,
    });
    expect(withdrawResult.transactions).toHaveTransaction({
      from: jettonWalletTonnelContract.address,
      to: jettonWalletDepositor.address,
      success: true,
    });

      // const check_verify2 = await tonnel.getCheckVerify(beginCell().storeUint(0, 32)
      //     .storeUint(0 ?? 0, 64)
      //     .storeRef(beginCell()
      //         .storeUint(BigInt(publicSignals[0]), 256)
      //         .storeUint(BigInt(publicSignals[1]), 256)
      //         .storeUint(BigInt(publicSignals[3]), 10)
      //         .storeRef(
      //             beginCell().storeAddress(sender.address)
      //                 .endCell()
      //         ).storeRef(parseG1Func(proof.pi_a.slice(0, 2).map((num: string) => BigInt(num)))).storeRef(parseG2Func(B_x[0], B_x[1], B_y))
      //         .storeRef(parseG1Func(proof.pi_c.slice(0, 2).map((num: string) => BigInt(num))))
      //         .endCell()).endCell());
      // expect(check_verify2).toEqual(0);

    console.log(await jettonWalletTonnelContract.getBalance())
    console.log(await jettonWalletDepositor.getBalance())
    console.log(await jettonWalletOwner.getBalance())
    // expect(await jettonWalletTonnelContract.getBalance()).toEqual(toNano('0'))
    // expect(await jettonWalletDepositor.getBalance()).toEqual(toNano('9.94'))
    // expect(await jettonWalletOwner.getBalance()).toEqual(toNano('0.06'))

    expect(withdrawResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: tonnelJettonMaster.address,
      success: true,
    })
    const jettonWalletRelayerContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await tonnelJettonMaster.getWalletAddress(owner.address)))
    expect(withdrawResult.transactions).toHaveTransaction({
      from: tonnelJettonMaster.address,
      to: jettonWalletRelayerContract.address,
      success: true,
    })

    expect(await jettonWalletRelayerContract.getBalance()).toEqual(toNano(50))

    console.log('after', Number(await tonnel.getBalance()) / 1000000000);

  }, 500000);


  // it('should init Merkle and then deposit and then some invalid txs(With pre-generated proofs and inputs)', async () => {
  //   await merkleInitialize();
  //   const tree = new MerkleTree(20);
  //   const rootInit = await tonnel.getLastRoot();
  //   expect(BigInt(tree.root())).toEqual(rootInit);
  //
  //   const sender = await blockchain.treasury('sender');
  //   const cell_address_sender = beginCell().storeAddress(sender.address).endCell();
  //   const cell_address_owner = beginCell().storeAddress(owner.address).endCell();
  //
  //
  //   const randomBuf = rbuffer(31);
  //   const randomBuf2 = rbuffer(31);
  //   // const nullifier = toBigIntLE(randomBuf2);
  //   // const secret = toBigIntLE(randomBuf);
  //   const nullifier = "284741391258851987273066117465250401658211913176434555769699128238924427012"
  //   let secret = "294170850052247494318845152993032133433606306560827844618331541287033881968"
  //   console.log('secret', secret.toString())
  //   console.log('nullifier', nullifier.toString())
  //   const commitment = Sha256(secret.toString(), nullifier.toString());
  //
  //
  //   const increaseResult = await tonnel.sendDeposit(sender.getSender(), {
  //     value: toNano((deposit_fee + pool_size * (1 + fee)).toString()),
  //     commitment: BigInt(commitment),
  //
  //   });
  //
  //   expect(increaseResult.transactions).toHaveTransaction({
  //     from: sender.address,
  //     to: tonnel.address,
  //     success: true,
  //   });
  //
  //   expect(increaseResult.transactions).toHaveTransaction({
  //     from: tonnel.address,
  //     to: owner.address,
  //     success: true,
  //     value: toNano((pool_size * fee).toString()),
  //   });
  //   expect(await tonnel.getBalance()).toBeGreaterThan(toNano(pool_size))
  //   tree.insert(commitment);
  //   const merkleProof = tree.proof(0);
  //
  //   const increaseResult2 = await tonnel.sendContinue(sender.getSender(), {
  //     value: toNano('0.8'),
  //   });
  //   expect(increaseResult2.transactions).toHaveTransaction({
  //     from: sender.address,
  //     to: tonnel.address,
  //     success: true,
  //   });
  //   const rootAfter = await tonnel.getLastRoot();
  //   expect(BigInt(tree.root())).toEqual(rootAfter);
  //
  //
  //   // const input = {
  //   //   root: tree.root(),
  //   //   secret: secret.toString(),
  //   //   nullifier: nullifier.toString(),
  //   //   nullifierHash: Sha256(nullifier.toString(), nullifier.toString()),
  //   //   fee: 10,
  //   //   recipient: cell_address_sender.beginParse().loadUintBig(256),
  //   //   relayer: cell_address_owner.beginParse().loadUintBig(256),
  //   //
  //   //   pathElements: merkleProof.pathElements,
  //   //   pathIndices: merkleProof.pathIndices,
  //   // };
  //
  //
  //   // let {proof, publicSignals} = await groth16.fullProve(input, wasmPath, zkeyPath);
  //   // console.log('publicSignals', publicSignals)
  //   // console.log('proof', proof)
  //   let proof =  {
  //     pi_a: [
  //       '3913154814462420064178596594583685198711621933712374661025907427076958133973715943592548689611851589624637647485533',
  //       '1949826439636536999114193859292313943118507621594074238865663437438314408133687958124611763975678875535137703923355',
  //       '1'
  //     ],
  //     pi_b: [
  //       [
  //         '108817148224187241299480705372205651555417174168131983503515375010672506573162731686239923103349164102922202486188',
  //         '105449591120517016663997384078720570416409913046980740938659767112434720761148110458776710450199824136753013825984'
  //       ],
  //       [
  //         '2238842924159216323413953126780358828608855527254936394252225254292900675190327172379177348070196807511497481959519',
  //         '1157833459710116065703813841501227812921849216841052504092003947011433632047712588079028154985521076222600307664691'
  //       ],
  //       [ '1', '0' ]
  //     ],
  //     pi_c: [
  //       '3601962559803233164389938885867217131473116888368336257535939938717426698653468656869068756750669233573099531573859',
  //       '3289999151513477234098718438539946743899086989791381527936042905753633927695897110057200750487163860915936366627189',
  //       '1'
  //     ],
  //     protocol: 'groth16',
  //     curve: 'bls12381'
  //   }
  //   let publicSignals =  [
  //     '10934624895302180659671845926392135083241805773152440108976930874739508653527',
  //     '48759474743477377679240327706664862083466080881053914687695063497158044362968',
  //     '5477617119893546710537552393898901286136209382584656943527614528969593445475',
  //     '5475112502061704042564098634582499353301677279502282160480018399738705888834',
  //     '10'
  //   ]
  //
  //   const B_x = proof.pi_b[0].map((num: string) => BigInt(num))
  //   const B_y  = proof.pi_b[1].map((num: string) => BigInt(num))
  //
  //   const withdrawResult = await tonnel.sendWithdraw(sender.getSender(), {
  //     value: toNano((deposit_fee + pool_size * (1 + fee)).toString()),
  //     root: BigInt(publicSignals[0]),
  //     nullifierHash: BigInt(publicSignals[1]),
  //     recipient: sender.address,
  //     fee: BigInt(publicSignals[4]),
  //     relayer: owner.address,
  //     a: parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
  //     b: parseG2Func(B_x[0], B_x[1], B_y),
  //     c: parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
  //   });
  //
  //   expect(withdrawResult.transactions).toHaveTransaction({
  //     from: sender.address,
  //     to: tonnel.address,
  //     success: true,
  //   });
  //   expect(withdrawResult.transactions).toHaveTransaction({
  //     from: tonnel.address,
  //     to: owner.address,
  //     success: true,
  //     value: toNano((pool_size * 10 / 1000).toString()),
  //   });
  //   expect(withdrawResult.transactions).toHaveTransaction({
  //     from: tonnel.address,
  //     to: sender.address,
  //     success: true,
  //     value: toNano((pool_size * (1000 - 10) / 1000).toString()),
  //   });
  //   const withdrawResult2 = await tonnel.sendWithdraw(sender.getSender(), {
  //     value: toNano((deposit_fee + pool_size * (1 + fee)).toString()),
  //     root: BigInt(publicSignals[0]),
  //     nullifierHash: BigInt(publicSignals[1]),
  //     recipient: sender.address,
  //     fee: BigInt(publicSignals[4]),
  //     relayer: owner.address,
  //     a: parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
  //     b: parseG2Func(B_x[0], B_x[1], B_y),
  //     c: parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
  //   });
  //
  //   expect(withdrawResult2.transactions).toHaveTransaction({
  //     from: sender.address,
  //     to: tonnel.address,
  //     exitCode: ERRORS.verify_failed_double_spend,
  //   });
  //
  //   const withdrawResult3 = await tonnel.sendWithdraw(sender.getSender(), {
  //     value: toNano((deposit_fee + pool_size * (1 + fee)).toString()),
  //     root: BigInt("123123123"),
  //     nullifierHash: BigInt(publicSignals[1]),
  //     recipient: sender.address,
  //     fee: BigInt(publicSignals[4]),
  //     relayer: owner.address,
  //     a: parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
  //     b: parseG2Func(B_x[0], B_x[1], B_y),
  //     c: parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
  //   });
  //
  //   expect(withdrawResult3.transactions).toHaveTransaction({
  //     from: sender.address,
  //     to: tonnel.address,
  //     exitCode: ERRORS.verify_failed_root,
  //   });
  //
  //   const withdrawResult4 = await tonnel.sendWithdraw(sender.getSender(), {
  //     value: toNano((deposit_fee + pool_size * (1 + fee)).toString()),
  //     root: BigInt("123123123"),
  //     nullifierHash: BigInt(publicSignals[1]),
  //     recipient: sender.address,
  //     fee: BigInt(1001),
  //     relayer: owner.address,
  //     a: parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
  //     b: parseG2Func(B_x[0], B_x[1], B_y),
  //     c: parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
  //   });
  //
  //   expect(withdrawResult4.transactions).toHaveTransaction({
  //     from: sender.address,
  //     to: tonnel.address,
  //     exitCode: ERRORS.verify_failed_fee,
  //   });
  //
  //
  //
  //
  // }, 500000);

});
