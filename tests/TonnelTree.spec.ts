import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {Address, beginCell, Builder, Cell, Sender, toNano} from 'ton-core';
import {ERRORS, Tonnel} from '../wrappers/Tonnel';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {parseG1Func, parseG2Func, rbuffer, toBigIntLE} from "../utils/circuit";
import path from "path";
// @ts-ignore
import {groth16} from "snarkjs";
import {JettonMinter} from "../wrappers/JettonMinter";
import {JettonWallet} from "../wrappers/JettonWallet";
import MerkleTree, { Element } from "fixed-merkle-tree";
import {mimcHash2, mimcHash3} from "../utils/merkleTree";
import {TonnelTree} from "../wrappers/TonnelTree";

const Note = require('../utils/note')
const Account = require('../utils/account')



import jsSHA from 'jssha';
import {BigNumber} from "ethers";
import {Miner, Opcodes} from "../wrappers/Miner";
import {APSwap} from "../wrappers/APSwap";
import exp = require("node:constants");

const toBuffer = (value: any, length: number) =>
    Buffer.from(
        BigNumber.from(value)
            .toHexString()
            .slice(2)
            .padStart(length * 2, '0'),
        'hex',
    )

function hashInputs(input: {
  oldRoot: any;
  newRoot: any;
  pathIndices: any;
  instances: string | any[];
  hashes: any[];
  blocks: any[];
}) {
  const sha = new jsSHA('SHA-256', 'ARRAYBUFFER')
  sha.update(toBuffer(input.oldRoot, 32))
  sha.update(toBuffer(input.newRoot, 32))
  sha.update(toBuffer(input.pathIndices, 4))

  for (let i = 0; i < input.instances.length; i++) {
    sha.update(toBuffer(input.hashes[i], 32))
    sha.update(toBuffer(input.instances[i], 4))
    sha.update(toBuffer(input.blocks[i], 4))
  }

  const hash = '0x' + sha.getHash('HEX')
  const result = BigNumber.from(hash)
      .mod(BigNumber.from('52435875175126190479447740508185965837690552500527637822603658699938581184513'))
      .toString()
  return result
}

function bitsToNumber(bits: any[]) {
  let result = 0
  for (const item of bits.slice().reverse()) {
    result = (result << 1) + item
  }
  return result
}

const toFixedHex = (number: any, length = 32) =>
    '0x' +
    (number instanceof Buffer
            ? number.toString('hex')
            : BigNumber.from(number).toHexString().slice(2)
    ).padStart(length * 2, '0')


export const get32BitsOfInstance = (instance: Address) => {
  const addressSlice = beginCell().storeAddress(instance).endCell()
  return addressSlice.beginParse().loadUint(32)

}

const _updateTree = (tree: MerkleTree, element: string) => {
  const oldRoot = tree.root
  tree.insert(element)
  const newRoot = tree.root
  const {pathElements, pathIndices} = tree.path(tree.elements.length - 1)
  return {
    oldRoot,
    newRoot,
    pathElements,
    pathIndices: bitsToNumber(pathIndices),
  }
}


async function getTreeProof(input_tree: {
  pathElements: Element[];
  newRoot: string | number;
  leaf: bigint;
  oldRoot: string | number;
  pathIndices: number
}) {

  const wasmPath = path.join(__dirname, "../build/TreeUpdater/circuit.wasm");
  const zkeyPath = path.join(__dirname, "../build/TreeUpdater/circuit_final.zkey");
  const vkeyPath = path.join(__dirname, "../build/TreeUpdater/verification_key.json");
  const vkey = require(vkeyPath);

  let {proof, publicSignals} = await groth16.fullProve(input_tree, wasmPath, zkeyPath);

  const B_x = proof.pi_b[0].map((num: string) => BigInt(num))
  const B_y  = proof.pi_b[1].map((num: string) => BigInt(num))
  const verify = await groth16.verify(vkey, publicSignals, proof);
  expect(verify).toEqual(true);
  const a =  parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num)))
  const b = parseG2Func(B_x[0], B_x[1], B_y)
  const c = parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))

  return beginCell().storeRef(a).storeRef(b).storeRef(c).endCell()

}

const reward = async function (
    account: { amount: any; commitment: any; secret: any; nullifier: any; nullifierHash: any; },
    note: {
      withdrawBlock: any;
      depositBlock: any;
      commitment: any;
      nullifierHash: any;
      instance: any;
      rewardNullifier: any;
      secret: any;
      nullifier: any;
    },
    fee: any, rate: any, accountCommitments: any,
    depositDataEvents: any[], withdrawalDataEvents: any[],
    depositTree: any, withdrawalTree: any) {
  const newAmount = BigInt(account.amount) + BigInt(rate) * BigInt(note.withdrawBlock - note.depositBlock) - BigInt(fee)
  const newAccount = new Account({amount: newAmount})

  const depositItem = depositDataEvents.filter((x) => BigInt(x.hash) == note.commitment)
  if (depositItem.length === 0) {
    throw new Error('The deposits tree does not contain such note commitment')
  }
  const depositPath = depositTree.path(depositDataEvents.indexOf(depositItem[0]))


  const withdrawalItem = withdrawalDataEvents.filter((x) => x.hash === note.nullifierHash)
  if (withdrawalItem.length === 0) {
    throw new Error('The withdrawals tree does not contain such note nullifier')
  }
  const withdrawalPath = withdrawalTree.path(withdrawalDataEvents.indexOf(withdrawalItem[0]))
  const accountTree = new MerkleTree(20, accountCommitments, {
    hashFunction: mimcHash2,
    zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
  })
  const zeroAccount = {
    pathElements: new Array(20).fill(0),
    pathIndices: new Array(20).fill(0),
  }
  const accountIndex = accountTree.indexOf(account.commitment, (a, b) => {
    return a === b
  })
  const accountPath = accountIndex !== -1 ? accountTree.path(accountIndex) : zeroAccount
  const accountTreeUpdate = _updateTree(accountTree, newAccount.commitment)

  const input = {
    rate,
    fee,
    instance: note.instance,
    rewardNullifier: note.rewardNullifier,

    noteSecret: note.secret,
    noteNullifier: note.nullifier,

    inputAmount: account.amount,
    inputSecret: account.secret,
    inputNullifier: account.nullifier,
    inputRoot: accountTreeUpdate.oldRoot,
    inputPathElements: accountPath.pathElements,
    inputPathIndices: accountPath.pathIndices,
    inputNullifierHash: account.nullifierHash,

    outputAmount: newAccount.amount,
    outputSecret: newAccount.secret,
    outputNullifier: newAccount.nullifier,
    outputRoot: accountTreeUpdate.newRoot,
    outputPathIndices: accountTreeUpdate.pathIndices,
    outputPathElements: accountTreeUpdate.pathElements,
    outputCommitment: newAccount.commitment,

    depositBlock: note.depositBlock,
    depositRoot: depositTree.root,
    depositPathIndices: depositPath.pathIndices,
    depositPathElements: depositPath.pathElements,

    withdrawalBlock: note.withdrawBlock,
    withdrawalRoot: withdrawalTree.root,
    withdrawalPathIndices: withdrawalPath.pathIndices,
    withdrawalPathElements: withdrawalPath.pathElements,
  }

  const input_tree = {
    oldRoot: accountTreeUpdate.oldRoot,
    newRoot: accountTreeUpdate.newRoot,
    leaf: newAccount.commitment,
    pathIndices: accountTreeUpdate.pathIndices,
    pathElements: accountTreeUpdate.pathElements,
  }

  const treeProof = await getTreeProof(input_tree)

  const wasmPath = path.join(__dirname, "../build/Reward/circuit.wasm");
  const zkeyPath = path.join(__dirname, "../build/Reward/circuit_final.zkey");
  const vkeyPath = path.join(__dirname, "../build/Reward/verification_key.json");
  const vkey = require(vkeyPath);

  let {proof, publicSignals} = await groth16.fullProve(input, wasmPath, zkeyPath);

  const B_x = proof.pi_b[0].map((num: string) => BigInt(num))
  const B_y  = proof.pi_b[1].map((num: string) => BigInt(num))

  const verify = await groth16.verify(vkey, publicSignals, proof);
  expect(verify).toEqual(true);
  const a =  parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num)))
  const b = parseG2Func(B_x[0], B_x[1], B_y)
  const c = parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))

  const args = {
    rate: input.rate,
    fee: input.fee,
    instance: input.instance,
    rewardNullifier: input.rewardNullifier,
    depositRoot: input.depositRoot,
    withdrawalRoot: input.withdrawalRoot,
    account: {
      inputRoot: input.inputRoot,
      inputNullifierHash: input.inputNullifierHash,
      outputRoot: input.outputRoot,
      outputPathIndices: input.outputPathIndices,
      outputCommitment: input.outputCommitment,
    },
    proof: beginCell().storeRef(a).storeRef(b).storeRef(c).endCell(),
    proofTree: treeProof,
  }

  return {
    // proof,
    args,
    account: newAccount,
  }
}

const withdraw = async function (
    account: {
      amount: string | number | bigint | boolean;
      commitment: Element;
      secret: any;
      nullifier: any;
      nullifierHash: any;
    }, amount: any, recipient: Address, fee = 0, accountCommitments: any[] | undefined ){

  const newAmount = BigInt(account.amount) - BigInt(amount) - BigInt(fee)
  const newAccount = new Account({ amount: newAmount })
  const accountTree = new MerkleTree(20, accountCommitments, {
    hashFunction: mimcHash2,
    zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',

  })
  const accountIndex = accountTree.indexOf(account.commitment, (a, b) => {
    return a === b
  })
  if (accountIndex === -1) {
    throw new Error('The accounts tree does not contain such account commitment')
  }
  const accountPath = accountTree.path(accountIndex)

  const accountTreeUpdate = _updateTree(accountTree, newAccount.commitment)
  const ext_cell = beginCell().storeCoins(fee).storeAddress(recipient).endCell();
  const hash = BigInt("0x" + ext_cell.hash().toString('hex'))
  console.log(accountTreeUpdate)
  const input = {
    amount: BigInt(amount) + BigInt(fee),
    extDataHash: hash,
    inputAmount: account.amount,
    inputSecret: account.secret,
    inputNullifier: account.nullifier,
    inputNullifierHash: account.nullifierHash,
    inputRoot: accountTreeUpdate.oldRoot,
    inputPathIndices: accountPath.pathIndices,
    inputPathElements: accountPath.pathElements,

    outputAmount: newAccount.amount,
    outputSecret: newAccount.secret,
    outputNullifier: newAccount.nullifier,
    outputRoot: accountTreeUpdate.newRoot,
    // @ts-ignore
    outputPathIndices: accountTreeUpdate.pathIndices,
    outputPathElements: accountTreeUpdate.pathElements,
    outputCommitment: newAccount.commitment,
  }

  const wasmPath = path.join(__dirname, "../build/Withdraw AP/circuit.wasm");
  const zkeyPath = path.join(__dirname, "../build/Withdraw AP/circuit_final.zkey");
  const vkeyPath = path.join(__dirname, "../build/Withdraw AP/verification_key.json");
  const vkey = require(vkeyPath);

  let {proof, publicSignals} = await groth16.fullProve(input, wasmPath, zkeyPath);

  const B_x = proof.pi_b[0].map((num: string) => BigInt(num))
  const B_y  = proof.pi_b[1].map((num: string) => BigInt(num))
  const verify = await groth16.verify(vkey, publicSignals, proof);
  expect(verify).toEqual(true);
  const a =  parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num)))
  const b = parseG2Func(B_x[0], B_x[1], B_y)
  const c = parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))

  const args = {
    amount: input.amount,
    extData: {
      fee: fee,
      recipient: recipient,
    },
    account: {
      inputRoot: input.inputRoot,
      inputNullifierHash: input.inputNullifierHash,
      outputRoot: input.outputRoot,
      outputPathIndices: input.outputPathIndices,
      outputCommitment: input.outputCommitment,
    },
    proof: beginCell().storeRef(a).storeRef(b).storeRef(c).endCell(),
  }

  return {
    // proof,
    args,
    account: newAccount,
  }
}

const sliceHash = (args: [
  Address,
  bigint,
  number,
]): bigint => {
  // int hash_leaf = cell_hash(begin_cell().store_uint(sender_address.preload_uint(32), 32).store_uint(commitment_value, 256).store_uint(now(), 32).end_cell());


  const cellInfo = beginCell()
      .storeUint(get32BitsOfInstance(args[0]), 32)
      .storeUint(args[1], 256)
      .storeUint(args[2], 32)
      .endCell()
  const hash = BigInt("0x" + cellInfo.hash().toString('hex'))
  return hash


}

/**
 * Generates inputs for a snark and tornado trees smart contract.
 * This function updates MerkleTree argument
 *
 * @param tree Merkle tree with current smart contract state. This object is mutated during function execution.
 * @param events New batch of events to insert.
 * @param isDeposit
 * @returns {{args: [string, string, string, string, *], input: {pathElements: *, instances: *, blocks: *, newRoot: *, hashes: *, oldRoot: *, pathIndices: string}}}
 */
async function batchTreeUpdate(tree: any, events: any[], isDeposit: boolean) {
  const batchHeight = Math.log2(events.length)
  if (!Number.isInteger(batchHeight)) {
    throw new Error('events length has to be power of 2')
  }
  const oldRoot = tree.root.toString()
  const leaves = events.map((e) => mimcHash3(get32BitsOfInstance(e.instance),
    isDeposit? e.note.commitment : e.note.nullifierHash,
    isDeposit? e.timestamp : e.timestampWithdraw))
  tree.bulkInsert(leaves)
  const newRoot = tree.root.toString()
  let {pathElements, pathIndices} = tree.path(tree.elements.length - 1)
  pathElements = pathElements.slice(batchHeight).map((a: any) => BigNumber.from(a).toString())
  pathIndices = bitsToNumber(pathIndices.slice(batchHeight)).toString()


  const input = {
    oldRoot,
    newRoot,
    pathIndices,
    pathElements,
    instances: events.map((e) => BigNumber.from(get32BitsOfInstance(e.instance)).toString()),
    hashes: events.map((e) => BigNumber.from(
        isDeposit? e.note.commitment : e.note.nullifierHash
    ).toString()),
    blocks: events.map((e) => BigNumber.from(isDeposit? e.timestamp : e.timestampWithdraw).toString()),
    argsHash: '',
  }

  input.argsHash = hashInputs(input)


  const wasmPath = path.join(__dirname, "../build/BatchTree/circuit.wasm");
  const zkeyPath = path.join(__dirname, "../build/BatchTree/circuit_final.zkey");
  const vkeyPath = path.join(__dirname, "../build/BatchTree/verification_key.json");
  const vkey = require(vkeyPath);

  let {proof, publicSignals} = await groth16.fullProve(input, wasmPath, zkeyPath);

  const B_x = proof.pi_b[0].map((num: string) => BigInt(num))
  const B_y  = proof.pi_b[1].map((num: string) => BigInt(num))
  const verify = await groth16.verify(vkey, publicSignals, proof);
  expect(verify).toEqual(true);
  const a =  parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num)))
  const b = parseG2Func(B_x[0], B_x[1], B_y)
  const c = parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
  const args = [
    toFixedHex(input.argsHash),
    toFixedHex(input.oldRoot),
    toFixedHex(input.newRoot),
    toFixedHex(input.pathIndices, 4),
    events.map((e) => ({
      hash: toFixedHex(isDeposit? e.note.commitment : e.note.nullifierHash),
      instance: toFixedHex(BigNumber.from(get32BitsOfInstance(e.instance)), 4),
      timestamp: toFixedHex(isDeposit? e.timestamp : e.timestampWithdraw, 4),
    })),

  ]
  return {input, args, tree, a, b, c}
}

const fee = 0.010;
const pool_size = 5;
const deposit_fee = 0.22;
export const getEncodedDataCell = (data: any[], events: Builder) => {
  if (data.length == 0) {
    return events
  } else {
    // console.log(data.length)

    // events.push(index--)
    // events.push(index--)
    // events.push(index--)
    let newEvents = beginCell()
    if (data.length > 3) {
      newEvents = getEncodedDataCell(data.slice(3), newEvents)
    }
    for (let i = 0; i < data.length && i < 3; i++) {
      // console.log(i, data[i])
      events.storeRef(beginCell().storeSlice(data[i]).endCell())
    }

    events.storeRef(newEvents)

    return events
  }

}


describe('TonnelTree', () => {
  let code: Cell;
  let codeMiner: Cell;
  let codeAPSwap: Cell;

  let codeMixer: Cell;
  let codeMaster: Cell;
  let codeWallet: Cell;

  beforeAll(async () => {
    code = await compile('TonnelTree');
    codeMixer = await compile('Tonnel');
    codeMiner = await compile('Miner');
    codeAPSwap = await compile('APSwap');
    codeMaster = await compile('JettonMinter');
    codeWallet = await compile('JettonWallet');


  }, 500000000);

  let blockchain: Blockchain;
  let tonnelTree: SandboxContract<TonnelTree>;
  let owner: SandboxContract<TreasuryContract>;
  let miner: SandboxContract<Miner>;
  let apswap: SandboxContract<APSwap>;
  let tonnel: SandboxContract<Tonnel>;
  let tonnelJettonMaster: SandboxContract<JettonMinter>;


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

    tonnelTree = blockchain.openContract(
        TonnelTree.createFromConfig(
            {
              ownerAddress: owner.address,
              JettonAddress: tonnelJettonMaster.address,
              minerAddress: owner.address,
            },
            code
        )
    );


    let deployResult = await tonnelTree.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: tonnelTree.address,
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
              TONNEL_TREE_ADDRESS: tonnelTree.address
            },
            codeMixer
        )
    );


    deployResult = await tonnel.sendDeploy(deployer.getSender(), toNano('0.05'));
    await tonnelJettonMaster.sendMintAccess(owner.getSender(),{
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: tonnel.address
    })
    await tonnelJettonMaster.sendMintAccess(owner.getSender(),{
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: tonnelTree.address
    })


    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: tonnel.address,
      deploy: true,
      success: true,
    });

    await tonnelTree.sendAddPool(owner.getSender(), {
        value: toNano('0.02'),
        pool: tonnel.address
        })


    apswap = blockchain.openContract(
        APSwap.createFromConfig(
            {
              JettonMasterAddress: tonnelJettonMaster.address,
              ADMIN_ADDRESS: owner.address,
              MINER_ADDRESS: owner.address,
              start: deployJettonResult.transactions[0].now
            },
            codeAPSwap
        )
    );

    await apswap.sendDeploy(deployer.getSender(), toNano('0.05'));
    await tonnelJettonMaster.sendMintAccess(owner.getSender(),{
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: apswap.address
    })
    miner = blockchain.openContract(
        Miner.createFromConfig(
            {
              JettonMasterAddress: tonnelJettonMaster.address,
              ADMIN_ADDRESS: owner.address,
              REWARD_SWAP_ADDRESS: apswap.address,
              TONNEL_TREE_ADDRESS: tonnelTree.address
            },
            codeMiner
        )
    );

    await miner.sendDeploy(deployer.getSender(), toNano('0.05'));


    let res = await apswap.sendSetMiner(owner.getSender(), toNano('0.05'), miner.address);

    expect(res.transactions).toHaveTransaction({
        from: owner.address,
        to: apswap.address,
        success: true,
        });
    res = await tonnelTree.sendSetMiner(owner.getSender(),{
        miner: miner.address,
        value: toNano('0.05'),
      miner_fee: toNano('0.24')
        })
    expect(res.transactions).toHaveTransaction({
        from: owner.address,
        to: tonnelTree.address,
        success: true,
        });

    res = await miner.sendSetRate(owner.getSender(),{
        value: toNano('0.05'),
        rate: BigInt(100),
        pool: tonnel.address
        })
    expect(res.transactions).toHaveTransaction({
        from: owner.address,
        to: miner.address,
        success: true,
        });

  });

  async function doDeposit(tree: MerkleTree, note: any, sender: any) {
    const rootInit = await tonnel.getLastRoot();
    // expect(BigInt(tree.root)).toEqual(rootInit);
    console.log('before', Number(await tonnel.getBalance()) / 1000000000);

    let commitment = note.commitment;

    const old_root = tree.root;

    tree.insert(commitment);

    const root = tree.root;
    // const { pathElements, pathIndices } = tree.path(tree.elements.length - 1)


    // let input = {
    //   oldRoot: old_root,
    //   newRoot: root,
    //   leaf: commitment,
    //   pathIndices: tree.elements.length - 1,
    //   pathElements: pathElements,
    // }
    // console.log(input)
    // const zkeyPathInsert = path.join(__dirname, "../build/insert/circuit_final.zkey");
    // const wasmPathInsert = path.join(__dirname, "../build/insert/circuit.wasm");
    // const vkeyInsertPath = path.join(__dirname, "../build/insert/verification_key.json");
    // const vkeyInsert = require(vkeyInsertPath);
    //
    // let {proof, publicSignals} = await groth16.fullProve(input,
    //     wasmPathInsert, zkeyPathInsert);
    //
    // let verify = await groth16.verify(vkeyInsert, publicSignals, proof);
    // expect(verify).toEqual(true);
    // let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    // let B_y = proof.pi_b[1].map((num: string) => BigInt(num))
    const depositResult = await tonnel.sendDeposit(sender.getSender(), {
      value: toNano((deposit_fee + pool_size * (1 + fee)).toFixed(9)),
      commitment: BigInt(commitment),
      newRoot: BigInt(root),
      oldRoot: BigInt(old_root),
      // payload: beginCell()
      //     .storeRef(parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))))
      //     .storeRef(parseG2Func(B_x[0], B_x[1], B_y))
      //     .storeRef(parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
      //     )
      //     .endCell()
      payload: Cell.fromBoc(Buffer.from('b5ee9c724101040100cb0003000302010060b5c5ca99c0f87a36d653b4df0f326a59dea825c9a2b17d9ee669905e6ccaaae3d6c6884ae8c30b2feca3acd95fe316a000c0827324eaeacf0dfdfff7d9aed416b3505a9f57b5a1d80f3059cd96ca8b79b1720c357e73483f815c1f36f5cae4d92a0309da1755691fab88e8174f7f5b6d53a298c4c7ac4b34f2e05b99eeba1773c7305018c88c48a7af3e25cc2dc426d8f9f400609621df1965805649ab7b30bf78708c1acd141f940b1c4c43f97ec2eb7b9b6007b57a97dd9d1f8fe6672cc2f40b4e2c2f6c8fcce9', 'hex'))[0]
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
      value: toNano((pool_size * fee).toFixed(9)),
    });

    expect(depositResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: tonnelJettonMaster.address,
      success: true,
    })

    expect(depositResult.transactions).toHaveTransaction({
      from: tonnel.address,
      to: tonnelTree.address,
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

    // const rootAfter = await tonnel.getLastRoot();
    // expect(BigInt(tree.root)).toEqual(rootAfter);
    console.log('after', Number(await tonnel.getBalance()) / 1000000000);

    return depositResult.transactions[1].now
  }

  const registerWithdraw = async (nullifierHash: bigint, pool: { getSender: () => Sender; address: any; }) => {
    const depositResult = await tonnelTree.sendRegisterWithdraw(pool.getSender(), {
      value: toNano('0.02'),
      nullifierHash: BigInt(nullifierHash),
    });
    expect(depositResult.transactions).toHaveTransaction({
      from: pool.address,
      to: tonnelTree.address,
      success: true,
    });

  }



  it('should init Merkle and then deposit', async () => {
    console.log('before-1', await tonnelTree.getBalance() / 1000000000n);
    const events = []
    const tree = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    });
    let treeTONNEL_TREE_deposit = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',

    })
    let treeTONNEL_TREE_withdraw = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',

    })
    console.log('before balance' ,await tonnel.getBalance())
    for (let i = 0; i < 32; i++) {
      const sender = await blockchain.treasury('sender');

      const note = new Note({
        amount: pool_size,
        depositTime: 5,
        withdrawTime: 10,
        instance: tonnel.address,
      });
      const t = await doDeposit(tree, note, sender);
      console.log(tree.root,'root')
      note.depositBlock = t

      // const t = new Date().getTime() / 1000
      events.push({
        instance: tonnel.address,
        hash: note.commitment,
        timestamp: t,
        instance32Bit: get32BitsOfInstance(tonnel.address),
        note: note,
        timestampWithdraw: 0
      })
    }
    console.log('after balance' ,await tonnel.getBalance())

    // console.log(events)

    const { input, a, b, c } = await batchTreeUpdate(treeTONNEL_TREE_deposit, events, true)
    let encodedSliceArray = []
    for (let i = 0; i < 32; i+=3) {
      if (i < 30) {
        encodedSliceArray.push(
            beginCell()
                .storeUint(BigInt(input.hashes[i]), 256).storeUint(BigInt(input.instances[i]), 32).storeUint(BigInt(input.blocks[i]), 32)
                .storeUint(BigInt(input.hashes[i + 1]), 256).storeUint(BigInt(input.instances[i + 1]), 32).storeUint(BigInt(input.blocks[i + 1]), 32)
                .storeUint(BigInt(input.hashes[i + 2]), 256).storeUint(BigInt(input.instances[i + 2]), 32).storeUint(BigInt(input.blocks[i + 2]), 32)
                .endCell().beginParse()
        )
      } else {
        encodedSliceArray.push(
            beginCell()
                .storeUint(BigInt(input.hashes[i]), 256).storeUint(BigInt(input.instances[i]), 32).storeUint(BigInt(input.blocks[i]), 32)
                .storeUint(BigInt(input.hashes[i + 1]), 256).storeUint(BigInt(input.instances[i + 1]), 32).storeUint(BigInt(input.blocks[i + 1]), 32)
                .endCell().beginParse()
        )
      }
    }
    console.log('before-1', await tonnelTree.getBalance());

    const updateResult = await tonnelTree.sendUpdateDepositRoot(owner.getSender(), {
        value: toNano('0.2'),
      a: a,
      b: b,
      c: c,
      _currentRoot: input.oldRoot,
      _argsHash: BigInt(input.argsHash),
        _newRoot: input.newRoot,
        _pathIndices: input.pathIndices,
        events: getEncodedDataCell(encodedSliceArray ,beginCell()).endCell()
    });
    expect(updateResult.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnelTree.address,
      success: true,
    });
    expect(updateResult.transactions).toHaveTransaction({
      from: tonnelTree.address,
      to: tonnelJettonMaster.address,
      success: true,
    });
    console.log('after-1', await tonnelTree.getBalance());


    for (let i = 0; i < 32; i++) {
      const tx = await tonnel.sendWithdraw(owner.getSender(), {
        value: toNano('0.05'),
        queryID: 0,
        a: beginCell().endCell(),
        b: beginCell().endCell(),
        c: beginCell().endCell(),
        root: input.newRoot,
        nullifierHash: BigInt(events[i].note.nullifierHash),
        recipient: owner.address,
        fee: BigInt(10),
        });

      events[i].timestampWithdraw = tx.transactions[1].now
      events[i].note.withdrawBlock = tx.transactions[1].now



    }


    {
      const {input, a,b,c} = await batchTreeUpdate(treeTONNEL_TREE_withdraw, events, false)
      let encodedSliceArray = []
      for (let i = 0; i < 32; i += 3) {
        if (i < 30) {
          encodedSliceArray.push(
              beginCell()
                  .storeUint(BigInt(input.hashes[i]), 256).storeUint(BigInt(input.instances[i]), 32).storeUint(BigInt(input.blocks[i]), 32)
                  .storeUint(BigInt(input.hashes[i + 1]), 256).storeUint(BigInt(input.instances[i + 1]), 32).storeUint(BigInt(input.blocks[i + 1]), 32)
                  .storeUint(BigInt(input.hashes[i + 2]), 256).storeUint(BigInt(input.instances[i + 2]), 32).storeUint(BigInt(input.blocks[i + 2]), 32)
                  .endCell().beginParse()
          )
        } else {
          encodedSliceArray.push(
              beginCell()
                  .storeUint(BigInt(input.hashes[i]), 256).storeUint(BigInt(input.instances[i]), 32).storeUint(BigInt(input.blocks[i]), 32)
                  .storeUint(BigInt(input.hashes[i + 1]), 256).storeUint(BigInt(input.instances[i + 1]), 32).storeUint(BigInt(input.blocks[i + 1]), 32)
                  .endCell().beginParse()
          )
        }
      }
      const updateResult = await tonnelTree.sendUpdateDepositRoot(owner.getSender(), {
        value: toNano('0.2'),
        a: a,
        b: b,
        c: c,
        _currentRoot: input.oldRoot,
        _argsHash: BigInt(input.argsHash),
        _newRoot: input.newRoot,
        _pathIndices: input.pathIndices,
        events: getEncodedDataCell(encodedSliceArray, beginCell()).endCell(),
        opcode: 0x555
      });
      expect(updateResult.transactions).toHaveTransaction({
        from: owner.address,
        to: tonnelTree.address,
        success: true,
      });
      expect(updateResult.transactions).toHaveTransaction({
        from: tonnelTree.address,
        to: tonnelJettonMaster.address,
        success: true,
      });

    }
    const zeroAccount = new Account()
    const zeroAccount2 = new Account()


    const { args, account } = await reward(
        zeroAccount, events[0].note, 0, 100, [], events.map(
            (e) => {
              return {
                hash: e.note.commitment
              }
            }
        ),
        events.map(
            (e) => {
              return {
                hash: e.note.nullifierHash
              }
            }
        ), treeTONNEL_TREE_deposit, treeTONNEL_TREE_withdraw

    )


    const { args: args3, account: account_2 } = await reward(
        zeroAccount2, events[1].note, 0, 100, [], events.map(
            (e) => {
              return {
                hash: e.note.commitment
              }
            }
        ),
        events.map(
            (e) => {
              return {
                hash: e.note.nullifierHash
              }
            }
        ), treeTONNEL_TREE_deposit, treeTONNEL_TREE_withdraw

    )
    console.log('before-tonnel tree', await tonnelTree.getBalance());
    console.log('before-miner', await miner.getBalance());
    const res = await tonnelTree.sendRewardRequest(owner.getSender(), {
        value: toNano('0.24'),
        reward_payload: beginCell()
            .storeUint(BigInt(args.depositRoot), 256).storeUint(BigInt(args.withdrawalRoot), 256)
            .storeRef(
                beginCell().storeUint(100, 32).
                storeCoins(0)
                    .storeUint(events[0].instance32Bit, 32)
                    .storeUint(BigInt(args.rewardNullifier), 256)
                    .storeAddress(owner.address)
                    .storeUint(BigInt(args.account.inputRoot), 256)
                    .storeRef(
                        beginCell().storeUint(BigInt(args.account.inputNullifierHash), 256)
                            .storeUint(BigInt(args.account.outputRoot), 256)
                            .storeUint(BigInt(args.account.outputPathIndices), 32)
                            .storeUint(BigInt(args.account.outputCommitment), 256)
                            .endCell()
                    )
                    .storeRef(
                        args.proof
                    )
                    .endCell()
            )
            .storeRef(
                beginCell()
                    .storeUint(BigInt(args.account.inputRoot), 256)
                    .storeUint(BigInt(args.account.outputRoot), 256)
                    .storeUint(BigInt(args.account.outputCommitment), 256)
                    .storeUint(BigInt(args.account.outputPathIndices), 32)
                    .storeRef(args.proofTree)
                    .endCell()
            )
    })
    expect(res.transactions).toHaveTransaction({
        from: owner.address,
        to: tonnelTree.address,
        success: true,
    });

    expect(res.transactions).toHaveTransaction({
      from: tonnelTree.address,
      to: miner.address,
      success: true,
    });

    console.log('after-tonnel tree', await tonnelTree.getBalance());
    console.log('after-miner', await miner.getBalance());

    // expect(res.transactions).toHaveTransaction({
    //   from: miner.address,
    //   to: apswap.address,
    //   success: true,
    // });

    // expect(res.transactions).toHaveTransaction({
    //   from: apswap.address,
    //   to: tonnelJettonMaster.address,
    //   success: true,
    // });

    // expect(res.transactions).toHaveTransaction({
    //   from: tonnelJettonMaster.address,
    //   success: true,
    // });


    const accountTree = new MerkleTree(20, [
      args.account.outputCommitment
    ], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    })
    const accountTreeUpdate = _updateTree(accountTree, account_2.commitment)


    const input_tree = {
      oldRoot: accountTreeUpdate.oldRoot,
      newRoot: accountTreeUpdate.newRoot,
      leaf: account_2.commitment,
      pathIndices: accountTreeUpdate.pathIndices,
      pathElements: accountTreeUpdate.pathElements,
    }

    const treeProof = await getTreeProof(input_tree)

    const res2 = await tonnelTree.sendRewardRequest(owner.getSender(), {
      value: toNano('0.36'),
      reward_payload: beginCell()
          .storeUint(BigInt(args3.depositRoot), 256).storeUint(BigInt(args3.withdrawalRoot), 256)
          .storeRef(
              beginCell().storeUint(100, 32).
              storeCoins(0)
                  .storeUint(events[1].instance32Bit, 32)
                  .storeUint(BigInt(args3.rewardNullifier), 256)
                  .storeAddress(owner.address)
                  .storeUint(BigInt(args3.account.inputRoot), 256)
                  .storeRef(
                      beginCell().storeUint(BigInt(args3.account.inputNullifierHash), 256)
                          .storeUint(BigInt(args3.account.outputRoot), 256)
                          .storeUint(BigInt(args3.account.outputPathIndices), 32)
                          .storeUint(BigInt(args3.account.outputCommitment), 256)
                          .endCell()
                  )
                  .storeRef(
                      args3.proof
                  )
                  .endCell()
          )
          .storeRef(
              beginCell()
                  .storeUint(BigInt(input_tree.oldRoot), 256)
                  .storeUint(BigInt(input_tree.newRoot), 256)
                  .storeUint(BigInt(input_tree.leaf), 256)
                  .storeUint(BigInt(input_tree.pathIndices), 32)
                  .storeRef(treeProof)
                  .endCell()
          )
    })
    expect(res2.transactions).toHaveTransaction({
      from: owner.address,
      to: tonnelTree.address,
      success: true,
    });

    expect(res2.transactions).toHaveTransaction({
      from: tonnelTree.address,
      to: miner.address,
      success: true,
    });

    console.log('after-after-tonnel tree', await tonnelTree.getBalance());
    console.log('after-after-miner', await miner.getBalance());
    // expect(res2.transactions).toHaveTransaction({
    //   from: miner.address,
    //   to: apswap.address,
    //   success: true,
    // });

    // expect(res2.transactions).toHaveTransaction({
    //   from: apswap.address,
    //   to: tonnelJettonMaster.address,
    //   success: true,
    // });
    //
    // expect(res2.transactions).toHaveTransaction({
    //   from: tonnelJettonMaster.address,
    //   success: true,
    // });

    const { args: args2, account: account2 } = await withdraw(account,
        account.amount - BigInt(100),
        owner.address,
        100,
        [args.account.outputCommitment, args3.account.outputCommitment])

    console.log('before-withdraw', await miner.getBalance());
    const resWithdraw = await miner.sendWithdraw(owner.getSender(), {
      value: toNano('0.28'),
      amount: account.amount,
      fee: BigInt(100),
      recipient: owner.address,
      input_root: BigInt(args2.account.inputRoot),
        input_nullifier_hash: BigInt(args2.account.inputNullifierHash),
        output_root: BigInt(args2.account.outputRoot),
      output_path_index: BigInt(args2.account.outputPathIndices),
        output_commitment: BigInt(args2.account.outputCommitment),
      proof_withdraw: args2.proof,

      old_root: BigInt(0),
        new_root: BigInt(0),
      leaf: BigInt(0),
      path_index: BigInt(0),


      // reward_payload: beginCell()
      //     .storeUint(BigInt(args.depositRoot), 256).storeUint(BigInt(args.withdrawalRoot), 256)
      //     .storeRef(
      //         beginCell().storeUint(100, 32).
      //         storeCoins(toNano('0.000000001'))
      //             .storeUint(events[0].instance32Bit, 32)
      //             .storeUint(BigInt(args.rewardNullifier), 256)
      //             .storeAddress(owner.address)
      //             .storeUint(BigInt(args.account.inputRoot), 256)
      //             .storeRef(
      //                 beginCell().storeUint(BigInt(args.account.inputNullifierHash), 256)
      //                     .storeUint(BigInt(args.account.outputRoot), 256)
      //                     .storeUint(BigInt(args.account.outputPathIndices), 32)
      //                     .storeUint(BigInt(args.account.outputCommitment), 256)
      //                     .endCell()
      //             )
      //             .storeRef(
      //                 beginCell().endCell()//todo reward_proof
      //             )
      //             .endCell()
      //     )
      //     .storeRef(
      //         beginCell()
      //             .storeUint(BigInt(args.account.inputRoot), 256)
      //             .storeUint(BigInt(args.account.outputRoot), 256)
      //             .storeUint(BigInt(args.account.outputCommitment), 256)
      //             .storeUint(BigInt(args.account.outputPathIndices), 32)
      //             .storeRef(beginCell().endCell())//todo proof insert
      //             .endCell()
      //     )
    })
    expect(resWithdraw.transactions).toHaveTransaction({
      from: miner.address,
      to: apswap.address,
      success: true,
    });

    expect(resWithdraw.transactions).toHaveTransaction({
      from: apswap.address,
      to: tonnelJettonMaster.address,
      success: true,
    });

    expect(resWithdraw.transactions).toHaveTransaction({
      from: tonnelJettonMaster.address,
      success: true,
    });
    console.log('after-withdraw', await miner.getBalance());


  }, 50000000);


});
