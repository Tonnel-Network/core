import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {Address, beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {mimcHash2} from "../utils/merkleTree";
import {parseG1Func, parseG2Func, rbuffer, toBigIntLE} from "../utils/circuit";
import MerkleTree from "fixed-merkle-tree";

import path from "path";
// @ts-ignore
import {groth16} from "snarkjs";
import {JettonMinter} from "../wrappers/JettonMinter";
import {ERRORS, TonnelJetton} from "../wrappers/TonnelJetton";
import {JettonWallet} from "../wrappers/JettonWallet";

const wasmPath = path.join(__dirname, "../build/withdraw/circuit.wasm");
const zkeyPath = path.join(__dirname, "../build/withdraw/circuit_final.zkey");
const vkeyWithdrawPath = path.join(__dirname, "../build/withdraw/verification_key.json");
const vkeyWithdraw = require(vkeyWithdrawPath);

const wasmPathInsert = path.join(__dirname, "../build/insert/circuit.wasm");
const zkeyPathInsert = path.join(__dirname, "../build/insert/circuit_final.zkey");
const vkeyInsertPath = path.join(__dirname, "../build/insert/verification_key.json");
const vkeyInsert = require(vkeyInsertPath);

const fee = 0.005;
const pool_size = 1000;
const deposit_fee = 0.19;
const withdraw_fee = 0.3;

describe('TonnelJetton', () => {
  let code: Cell;
  let codeWallet: Cell;
  let codeMaster: Cell;
  async function doDeposit(tree: MerkleTree) {
    const rootInit = await tonnel.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootInit);
    // console.log('before', Number(await tonnel.getBalance()) / 1000000000);

    const sender = await blockchain.treasury('sender');


    const randomBuf = rbuffer(31);
    const randomBuf2 = rbuffer(31);
    const nullifier = toBigIntLE(randomBuf2);
    const secret = toBigIntLE(randomBuf);
    const commitment = mimcHash2(secret.toString(), nullifier.toString());



    const jettonWalletDepositor = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

    const jettonWalletTonnelContract = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(tonnel.address)))
    const jettonWalletOwner = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner.address)))


    const old_root = tree.root;

    tree.insert(commitment);

    const root = tree.root;
    const { pathElements, pathIndices } = tree.path(tree.elements.length - 1)


    let input = {
      oldRoot: old_root,
      newRoot: root,
      leaf: commitment,
      pathIndices: tree.elements.length - 1,
      pathElements: pathElements,
    }
    // console.log(input)
    // const time = Date.now()
    let {proof, publicSignals} = await groth16.fullProve(input,
        wasmPathInsert, zkeyPathInsert);
    // console.log(proof, publicSignals)
    // console.log(Date.now() - time)
    let verify = await groth16.verify(vkeyInsert, publicSignals, proof);
    expect(verify).toEqual(true);
    let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    let B_y = proof.pi_b[1].map((num: string) => BigInt(num))
    const payload =  beginCell()
        .storeRef(parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))))
        .storeRef(parseG2Func(B_x[0], B_x[1], B_y))
        .storeRef(parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
        )
        .endCell()


    const depositResult = await jettonWalletDepositor.sendTransfer(sender.getSender(), {
      value: toNano((deposit_fee + 0.05).toFixed(3)),
      toAddress: tonnel.address,
      queryId: 0,
      fwdAmount: toNano(deposit_fee.toFixed(3)),
      jettonAmount: toNano((pool_size + fee * pool_size).toString()),
      fwdPayload: beginCell().storeUint(BigInt(commitment), 256).storeUint(
          BigInt(root), 256
      ).storeUint(
          BigInt(old_root), 256
      ).storeRef(payload).endCell()
    });

    expect(depositResult.transactions).toHaveTransaction({
      from: jettonWalletDepositor.address,
      to: jettonWalletTonnelContract.address,
      success: true,
    });

    // expect(depositResult.transactions).toHaveTransaction({
    //   from: tonnel.address,
    //   to: tonnelJettonMaster.address,
    //   success: true,
    // });


    console.log('before1', Number(await tonnel.getBalance()) / 1000000000);


    const jettonWalletDepositorContract = await blockchain.openContract(
        JettonWallet.createFromAddress(await tonnelJettonMaster.getWalletAddress(sender.address)))
    // expect(depositResult.transactions).toHaveTransaction({
    //   from: tonnelJettonMaster.address,
    //   to: jettonWalletDepositorContract.address,
    //   success: true,
    // })

    expect(await jettonWalletTonnelContract.getBalance()).toBeGreaterThan(toNano(pool_size))

    const rootAfter = await tonnel.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootAfter);
    // console.log('after', Number(await tonnel.getBalance()) / 1000000000);

    return {
      commitment,
      secret,
      nullifier
    }
  }

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
    let deployJettonResult = await jettonMinter.sendDeploy(owner.getSender(), toNano('1'));
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

    deployJettonResult = await tonnelJettonMaster.sendDeploy(owner.getSender(), toNano('1'));
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
          depositorTonnelMint: 10,
          protocolFee: 10,
        },
        code
      )
    );

    await tonnelJettonMaster.sendMintAccess(owner2.getSender(),{
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: tonnel.address
    })


    const deployResult = await tonnel.sendDeploy(owner.getSender(), toNano('0.1'));

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

    const changeConfig = await tonnel.sendChangeConfig(owner.getSender(), {
      value: toNano('0.05'),
      new_fee_per_thousand: 5,
      new_tonnel_mint_amount_deposit: 350,
      new_tonnel_mint_amount_relayer: 200,
      deposit_fee: '0.15'
    })
    expect(changeConfig.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      success: true,
    });

  });


  it('should deployContract ', async () => {
    console.log(await tonnel.getBalance())
  });


  it('should init Merkle and then deposit', async () => {
    const tree = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    });
    const rootInit = await tonnel.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootInit);
    console.log('before', Number(await tonnel.getBalance()) / 1000000000);


    const randomBuf = rbuffer(31);
    const randomBuf2 = rbuffer(31);
    const nullifier = toBigIntLE(randomBuf2);
    const secret = toBigIntLE(randomBuf);
    const commitment = mimcHash2(secret.toString(), nullifier.toString());


    const sender = await blockchain.treasury('sender');


    const jettonWalletDepositor = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

    const jettonWalletTonnelContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(tonnel.address)))
    const jettonWalletOwner = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner.address)))


    const old_root = tree.root;

    tree.insert(commitment);

    const root = tree.root;
    const { pathElements, pathIndices } = tree.path(tree.elements.length - 1)


    let input = {
      oldRoot: old_root,
      newRoot: root,
      leaf: commitment,
      pathIndices: tree.elements.length - 1,
      pathElements: pathElements,
    }
    console.log(input)
    // const time = Date.now()
    let {proof, publicSignals} = await groth16.fullProve(input,
        wasmPathInsert, zkeyPathInsert);
    console.log(proof, publicSignals)
    // console.log(Date.now() - time)
    let verify = await groth16.verify(vkeyInsert, publicSignals, proof);
    expect(verify).toEqual(true);
    let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    let B_y = proof.pi_b[1].map((num: string) => BigInt(num))
    const payload =  beginCell()
        .storeRef(parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))))
        .storeRef(parseG2Func(B_x[0], B_x[1], B_y))
        .storeRef(parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
        )
        .endCell()


    const depositResult = await jettonWalletDepositor.sendTransfer(sender.getSender(), {
      value: toNano((deposit_fee + 0.05).toFixed(3)),
      toAddress: tonnel.address,
      queryId: 0,
      fwdAmount: toNano(deposit_fee.toFixed(3)),
      jettonAmount: toNano((pool_size + fee * pool_size).toString()),
      fwdPayload: beginCell().storeUint(BigInt(commitment), 256).storeUint(
          BigInt(old_root), 256// should be old root
      ).storeUint(
          BigInt(old_root), 256
      ).storeRef(payload).endCell()
    });

    expect(depositResult.transactions).toHaveTransaction({
      from: jettonWalletDepositor.address,
      to: jettonWalletTonnelContract.address,
      success: true,
    });
    console.log(jettonMinter.address.toString())

    expect(depositResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: tonnelJettonMaster.address,
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



    expect(await jettonWalletDepositorContract.getBalance()).toEqual(toNano(1))




    expect(await jettonWalletTonnelContract.getBalance()).toEqual(toNano(pool_size + fee * pool_size))
    expect(BigInt(await tonnel.getMinStuck())).toEqual(BigInt(commitment))
    const stuckFixResult = await tonnel.sendRemoveMinStuck(sender.getSender(), {
      value: toNano((0.2).toFixed(9)),
      commitment: BigInt(commitment),
      newRoot: BigInt(root),
      oldRoot: BigInt(old_root),
      payload: payload
    });

    expect(stuckFixResult.transactions).toHaveTransaction({
      from: sender.address,
      to: tonnel.address,
      success: true,
    });
    expect(BigInt(await tonnel.getMinStuck())).toEqual(BigInt(0))
    const rootAfter = await tonnel.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootAfter);
    console.log('after', Number(await tonnel.getBalance()) / 1000000000);

    const claimFeeResult = await tonnel.sendClaimFee(owner.getSender(), {
      value: toNano((0.1).toString()),
    });

    expect(claimFeeResult.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      success: true,
    });

    expect(claimFeeResult.transactions).toHaveTransaction({
      from: jettonWalletTonnelContract.address,
      to: jettonWalletOwner.address,
      success: true,
    });



  }, 50000000);


  it('should init Merkle and then revert on invalid deposit', async () => {
    const tree = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    });
    const rootInit = await tonnel.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootInit);
    console.log('before', Number(await tonnel.getBalance()) / 1000000000);


    const randomBuf = rbuffer(31);
    const randomBuf2 = rbuffer(31);
    const nullifier = toBigIntLE(randomBuf2);
    const secret = toBigIntLE(randomBuf);
    const commitment = mimcHash2(secret.toString(), nullifier.toString());


    const sender = await blockchain.treasury('sender');


    const jettonWalletDepositor = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

    const jettonWalletTonnelContract = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(tonnel.address)))
    const jettonWalletOwner = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner.address)))


    const old_root = tree.root;

    tree.insert(commitment);

    const root = tree.root;
    const { pathElements, pathIndices } = tree.path(tree.elements.length - 1)


    let input = {
      oldRoot: old_root,
      newRoot: root,
      leaf: commitment,
      pathIndices: tree.elements.length - 1,
      pathElements: pathElements,
    }
    console.log(input)
    // const time = Date.now()
    let {proof, publicSignals} = await groth16.fullProve(input,
        wasmPathInsert, zkeyPathInsert);
    console.log(proof, publicSignals)
    // console.log(Date.now() - time)
    let verify = await groth16.verify(vkeyInsert, publicSignals, proof);
    expect(verify).toEqual(true);
    let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    let B_y = proof.pi_b[1].map((num: string) => BigInt(num))
    const payload =  beginCell()
        .storeRef(parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))))
        .storeRef(parseG2Func(B_x[0], B_x[1], B_y))
        .storeRef(parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
        )
        .endCell()

    const previousBalance = await jettonWalletDepositor.getBalance();
    const depositResult = await jettonWalletDepositor.sendTransfer(sender.getSender(), {
      value: toNano((deposit_fee + 0.05).toFixed(3)),
      toAddress: tonnel.address,
      queryId: 2,
      fwdAmount: toNano(deposit_fee.toFixed(3)),
      jettonAmount: toNano((pool_size).toString()), //not paying fee
      fwdPayload: beginCell().storeUint(BigInt(commitment), 256).storeUint(
          BigInt(root), 256
      ).storeUint(
          BigInt(old_root), 256
      ).storeRef(payload).endCell()
    });

    expect(depositResult.transactions).toHaveTransaction({
      from: jettonWalletTonnelContract.address,
      to: jettonWalletDepositor.address,
      success: true,
    });

    expect(await jettonWalletTonnelContract.getBalance()).toEqual(toNano("0")) // should not hold users funds in revert scenario
    expect(await jettonWalletDepositor.getBalance()).toEqual(previousBalance) // should not hold users funds in revert scenario
    console.log('after', Number(await tonnel.getBalance()) / 1000000000);

  }, 50000000);



  it('should init Merkle and then deposit and then withdraw', async () => {
    const tree = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    });
    console.log('balance tonnel', await tonnel.getBalance())
    const data = []
    for (let i = 0; i < 5; i++) {
      data.push(await doDeposit(tree))
    }


    const merkleProof = tree.proof(data[3].commitment);

    const rootAfter = await tonnel.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootAfter);
    const sender = await blockchain.treasury('sender');
    const cell_address_sender = beginCell().storeAddress(sender.address).endCell();


    const input = {
      root: tree.root,
      secret: data[3].secret.toString(),
      nullifier: data[3].nullifier.toString(),
      nullifierHash: mimcHash2(data[3].nullifier.toString(), data[3].nullifier.toString()),
      fee: 10,
      recipient: cell_address_sender.beginParse().loadUintBig(256),
      pathElements: merkleProof.pathElements,
      pathIndices: merkleProof.pathIndices,
    };


    let {proof, publicSignals} = await groth16.fullProve(input, wasmPath, zkeyPath);

    const B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    const B_y  = proof.pi_b[1].map((num: string) => BigInt(num))
    const known = await tonnel.getRootKnown(BigInt(input.root));
    expect(known).toEqual(1);

    const verify = await groth16.verify(vkeyWithdraw, publicSignals, proof);
    expect(verify).toEqual(true);


    const withdrawResult = await tonnel.sendWithdraw(owner.getSender(), {
      value: toNano((withdraw_fee).toString()),
      root: BigInt(publicSignals[0]),
      nullifierHash: BigInt(publicSignals[1]),
      recipient: sender.address,
      fee: BigInt(publicSignals[3]),
      a: parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
      b: parseG2Func(B_x[0], B_x[1], B_y),
      c: parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
    });
    const jettonWalletDepositor = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

    const jettonWalletTonnelContract = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(tonnel.address)))
    const jettonWalletOwner = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner.address)))


    expect(withdrawResult.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      success: true,
    });
    expect(withdrawResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: jettonWalletTonnelContract.address,
      success: true,
    });
    // expect(withdrawResult.transactions).toHaveTransaction({
    //   from: jettonWalletTonnelContract.address,
    //   to: jettonWalletDepositor.address,
    //   success: true,
    // });
    expect(withdrawResult.transactions).toHaveTransaction({
      from: jettonWalletTonnelContract.address,
      to: jettonWalletOwner.address,
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


    const receiveFee = await tonnel.sendClaimFee(owner.getSender(), {
          value: toNano((0.1).toString()),
    });
    expect(receiveFee.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      success: true,
    });

    expect(receiveFee.transactions).toHaveTransaction({
      from: tonnel.address,
      to: jettonWalletTonnelContract.address,
      success: true,
    });


    console.log('after', await tonnel.getBalance());



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
