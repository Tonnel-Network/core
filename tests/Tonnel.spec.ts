import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {Address, beginCell, Cell, toNano} from 'ton-core';
import {ERRORS, Tonnel} from '../wrappers/Tonnel';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {rbuffer, toBigIntLE} from "../utils/circuit";
import path from "path";
// @ts-ignore
import { groth16 } from "snarkjs";
import {JettonMinter} from "../wrappers/JettonMinter";
import {JettonWallet} from "../wrappers/JettonWallet";
import exp = require("constants");
import MerkleTree from "fixed-merkle-tree";
import {mimcHash2} from "../utils/merkleTree";

const wasmPath = path.join(__dirname, "../build/withdraw/circuit.wasm");
const zkeyPath = path.join(__dirname, "../build/withdraw/circuit_final.zkey");
const vkeyWithdrawPath = path.join(__dirname, "../build/withdraw/verification_key.json");
const vkeyWithdraw = require(vkeyWithdrawPath);

const wasmPathInsert = path.join(__dirname, "../build/insert/circuit.wasm");
const zkeyPathInsert = path.join(__dirname, "../build/insert/circuit_final.zkey");
const vkeyInsertPath = path.join(__dirname, "../build/insert/verification_key.json");
const vkeyInsert = require(vkeyInsertPath);

const fee = 0.015;
const pool_size = 50;
const deposit_fee = 0.18;
const withdraw_fee = 0.15;

export function parseG1Func(G1: bigint[]) {
  let num = G1[0]
  let y = BigInt(G1[1])
  y *= 2n;
  y /= 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
  // padding to 381 bits
  let flag = y.toString(2)
  let cell = beginCell()
  num = BigInt(num)
  const bin  = num.toString(2)
  // padding to 384 bits
  const padding =  "10" + flag + bin.padStart(381, '0')
  // print each 48 bits
  for (let i = 0; i < padding.length; i += 48) {
    const chunk = padding.slice(i, i + 48)
    const dec = BigInt('0b' + chunk)
    // code += `.store_uint(${dec.toString(10)}, 48)`
    cell.storeUint(dec, 48)
  }

  return cell.endCell()

}
export function parseG2Func(num0: any, num1: any, ys:any) {
  let cell = beginCell()
  // a_flag1 = (y_im * 2) // q if y_im > 0 else (y_re * 2) // q python code
  let flag0
  if(ys[1] > 0) {
    ys[1] *= 2n;
    ys[1] /= 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
    flag0 = ys[1].toString(2)
  } else {
    ys[0] *= 2n;
    ys[0] /= 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
    flag0 = ys[0].toString(2)
  }
  // console.log(flag0)

  num1 = BigInt(num1)
  // console.log(num.toString(10))
  let bin  = num1.toString(2)
// padding to 384 bits
  let padding =  "10" + flag0 + bin.padStart(381, '0')
  for (let i = 0; i < padding.length; i += 96) {
    const chunk = padding.slice(i, i + 96)

    const dec = BigInt('0b' + chunk)
    // console.log(dec)
    cell.storeUint(dec, 96)
  }
  bin  = num0.toString(2)
// padding to 384 bits
  padding =  "000" + bin.padStart(381, '0')
  for (let i = 0; i < padding.length; i += 96) {
    const chunk = padding.slice(i, i + 96)
    const dec = BigInt('0b' + chunk)
    // console.log(dec)
    cell.storeUint(dec, 96)
  }
  return cell.endCell()

}



describe('Tonnel', () => {
  let code: Cell;
  let codeMaster: Cell;
  let codeWallet: Cell;
  async function doDeposit(tree: MerkleTree) {
    const rootInit = await tonnel.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootInit);
    console.log('before', Number(await tonnel.getBalance()) / 1000000000);

    const sender = await blockchain.treasury('sender');


    const randomBuf = rbuffer(31);
    const randomBuf2 = rbuffer(31);
    const nullifier = toBigIntLE(randomBuf2);
    const secret = toBigIntLE(randomBuf);
    const commitment = mimcHash2(secret.toString(), nullifier.toString());

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
    const time = Date.now()
    let {proof, publicSignals} = await groth16.fullProve(input,
        wasmPathInsert, zkeyPathInsert);
    // console.log(proof, publicSignals)
    // console.log(Date.now() - time)
    let verify = await groth16.verify(vkeyInsert, publicSignals, proof);
    expect(verify).toEqual(true);
    let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    let B_y = proof.pi_b[1].map((num: string) => BigInt(num))

    const depositResult = await tonnel.sendDeposit(sender.getSender(), {
      value: toNano((deposit_fee + pool_size * (1 + fee)).toFixed(9)),
      commitment: BigInt(commitment),
      newRoot: BigInt(root),
      oldRoot: BigInt(old_root),
      payload: beginCell()
          .storeRef(parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))))
          .storeRef(parseG2Func(B_x[0], B_x[1], B_y))
          .storeRef(parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
          )
          .endCell()
    });


    console.log('before1', Number(await tonnel.getBalance()) / 1000000000);

    expect(depositResult.transactions).toHaveTransaction({
      from: sender.address,
      to: tonnel.address,
      success: true,
    });

    expect(depositResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: owner.address,
      success: true,
      value: toNano((pool_size * fee).toString()),
    });

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

    expect(await tonnel.getBalance()).toBeGreaterThan(toNano(pool_size))

    const rootAfter = await tonnel.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootAfter);
    console.log('after', Number(await tonnel.getBalance()) / 1000000000);

    return {
      commitment,
      secret,
      nullifier
    }
  }
  beforeAll(async () => {
    code = await compile('Tonnel');
    codeMaster = await compile('JettonMinter');
    codeWallet = await compile('JettonWallet');




  });

  let blockchain: Blockchain;
  let tonnel: SandboxContract<Tonnel>;
  let tonnelJettonMaster: SandboxContract<JettonMinter>;
  let owner: SandboxContract<TreasuryContract>;
  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');
    tonnelJettonMaster = blockchain.openContract(JettonMinter.createFromConfig({
      adminAddress: owner.address,
      content: "https://api.tonnel.network/jetton/metadata",
      jettonWalletCode: codeWallet
    }, codeMaster));

    const deployer = await blockchain.treasury('deployer');
    const deployJettonResult = await tonnelJettonMaster.sendDeploy(owner.getSender(), toNano('0.05'));
    expect(deployJettonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnelJettonMaster.address,
      deploy: true,
      success: true,
    });

    tonnel = blockchain.openContract(
      Tonnel.createFromConfig(
        {
          ownerAddress: owner.address,
          tonnelJettonAddress: tonnelJettonMaster.address,
          depositorTonnelMint: 200,
          relayerTonnelMint: 100,
          protocolFee: 10,
        },
        code
      )
    );


    const deployResult = await tonnel.sendDeploy(deployer.getSender(), toNano('0.05'));
    await tonnelJettonMaster.sendMintAccess(owner.getSender(),{
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: tonnel.address
    })
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: tonnel.address,
      deploy: true,
      success: true,
    });

    const changeConfig = await tonnel.sendChangeConfig(owner.getSender(), {
      value: toNano('0.05'),
      new_fee_per_thousand: 15,
      new_tonnel_mint_amount_deposit: 100,
      new_tonnel_mint_amount_relayer: 50,
    })
    expect(changeConfig.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      success: true,
    });


  });


  it('should init Merkle and then deposit', async () => {
    console.log('before-1', await tonnel.getBalance() / 1000000000n);

    const tree = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    });
    const rootInit = await tonnel.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootInit);
    console.log('before', Number(await tonnel.getBalance()) / 1000000000);

    const sender = await blockchain.treasury('sender');


    const randomBuf = rbuffer(31);
    const randomBuf2 = rbuffer(31);
    const nullifier = toBigIntLE(randomBuf2);
    const secret = toBigIntLE(randomBuf);
    const commitment = mimcHash2(secret.toString(), nullifier.toString());

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
    const time = Date.now()
    let {proof, publicSignals} = await groth16.fullProve(input,
        wasmPathInsert, zkeyPathInsert);
    // console.log(proof, publicSignals)
    // console.log(Date.now() - time)
    let verify = await groth16.verify(vkeyInsert, publicSignals, proof);
    expect(verify).toEqual(true);
    let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    let B_y = proof.pi_b[1].map((num: string) => BigInt(num))
    const payload = beginCell()
        .storeRef(parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))))
        .storeRef(parseG2Func(B_x[0], B_x[1], B_y))
        .storeRef(parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
        )
        .endCell()

    const depositResult = await tonnel.sendDeposit(sender.getSender(), {
      value: toNano((deposit_fee + pool_size * (1 + fee)).toFixed(9)),
      commitment: BigInt(commitment),
      newRoot: BigInt(root),
        oldRoot: BigInt(old_root),
      payload: payload
    });


    console.log('before1', Number(await tonnel.getBalance()) / 1000000000);

    expect(depositResult.transactions).toHaveTransaction({
      from: sender.address,
      to: tonnel.address,
      success: true,
    });

    expect(depositResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: owner.address,
      success: true,
      value: toNano((pool_size * fee).toString()),
    });

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



    expect(await jettonWalletDepositorContract.getBalance()).toEqual(toNano(100))

    expect(await tonnel.getBalance()).toBeGreaterThan(toNano(pool_size))

    const rootAfter = await tonnel.getLastRoot();
    console.log(rootAfter)
    console.log('after', Number(await tonnel.getBalance()) / 1000000000);
    console.log(await tonnel.getMinStuck())
    let {proof: proof2, publicSignals: publicSignals2} = await groth16.fullProve(input,
        wasmPathInsert, zkeyPathInsert);
    // console.log(proof, publicSignals)
    // console.log(Date.now() - time)
    let verify2 = await groth16.verify(vkeyInsert, publicSignals2, proof2);
    expect(verify2).toEqual(true);
    let B_x2 = proof2.pi_b[0].map((num: string) => BigInt(num))
    let B_y2 = proof2.pi_b[1].map((num: string) => BigInt(num))
    const payloadGood = beginCell()
        .storeRef(parseG1Func(proof2.pi_a.slice(0,2).map((num: string ) => BigInt(num))))
        .storeRef(parseG2Func(B_x2[0], B_x2[1], B_y2))
        .storeRef(parseG1Func(proof2.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
        )
        .endCell()

    const stuckFixResult = await tonnel.sendRemoveMinStuck(sender.getSender(), {
      value: toNano((0.2).toFixed(9)),
      commitment: BigInt(commitment),
      newRoot: BigInt(root),
      oldRoot: BigInt(old_root),
      payload: payloadGood
    });

    expect(stuckFixResult.transactions).toHaveTransaction({
      from: sender.address,
      to: tonnel.address,
      success: true,
    });
    console.log(await tonnel.getMinStuck())

  }, 500000);



  it('should init Merkle and then deposit and then withdraw', async () => {
    const tree = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    });
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

    expect(withdrawResult.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      success: true,
    });
    expect(withdrawResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: owner.address,
      success: true,
      value: toNano((pool_size * 10 / 1000).toString()),
    });
    expect(withdrawResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: sender.address,
      success: true,
      value: toNano((pool_size * (1000 - 10) / 1000).toString()),
    });
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


    console.log('after', await tonnel.getBalance());


  }, 500000);


  it('should init Merkle and then deposit and then some invalid txs(With pre-generated proofs and inputs)', async () => {
    const tree = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    });
    const data = []
    for (let i = 0; i < 5; i++) {
      data.push(await doDeposit(tree))
    }
    const rootInit = await tonnel.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootInit);

    const sender = await blockchain.treasury('sender');
    const cell_address_sender = beginCell().storeAddress(sender.address).endCell();
    const cell_address_owner = beginCell().storeAddress(owner.address).endCell();
    const merkleProof = tree.proof(data[3].commitment);

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

    expect(withdrawResult.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      success: true,
    });
    expect(withdrawResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: owner.address,
      success: true,
      value: toNano((pool_size * 10 / 1000).toString()),
    });
    expect(withdrawResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: sender.address,
      success: true,
      value: toNano((pool_size * (1000 - 10) / 1000).toString()),
    });
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


    const withdrawResult2 = await tonnel.sendWithdraw(owner.getSender(), {
      value: toNano((withdraw_fee).toString()),
      root: BigInt(publicSignals[0]),
      nullifierHash: BigInt(publicSignals[1]),
      recipient: sender.address,
      fee: BigInt(publicSignals[3]),
      a: parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
      b: parseG2Func(B_x[0], B_x[1], B_y),
      c: parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
    });

    expect(withdrawResult2.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnel.address,
      exitCode: ERRORS.verify_failed_double_spend,
    });



  }, 500000);

});
