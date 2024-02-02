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
import MerkleTree from "fixed-merkle-tree";
import {mimcHash2} from "../utils/merkleTree";
import {TonnelTree} from "../wrappers/TonnelTree";

// const wasmPath = path.join(__dirname, "../build/Tree/circuit.wasm");
// const zkeyPath = path.join(__dirname, "../build/Tree/circuit_final.zkey");
// const vkeyPath = path.join(__dirname, "../build/Tree/verification_key.json");
// const vkey = require(vkeyPath);
//
import jsSHA from 'jssha';
import {BigNumber} from "ethers";

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
  timestamps: any[];
}) {
  const sha = new jsSHA('SHA-256', 'ARRAYBUFFER')
  sha.update(toBuffer(input.oldRoot, 32))
  sha.update(toBuffer(input.newRoot, 32))
  sha.update(toBuffer(input.pathIndices, 4))

  for (let i = 0; i < input.instances.length; i++) {
    sha.update(toBuffer(input.hashes[i], 32))
    sha.update(toBuffer(input.instances[i], 4))
    sha.update(toBuffer(input.timestamps[i], 4))
  }

  const hash = '0x' + sha.getHash('HEX')
  const result = BigNumber.from(hash)
      .mod(BigNumber.from('52435875175126190479447740508185965837690552500527637822603658699938581184513'))
      .toString()
  console.log(result)
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


const get32BitsOfInstance = (instance: Address) => {
  const addressSlice = beginCell().storeAddress(instance).endCell()
  // console.log(addressSlice.beginParse().loadUint(32))
  return addressSlice.beginParse().loadUint(32)

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
 * @returns {{args: [string, string, string, string, *], input: {pathElements: *, instances: *, timestamps: *, newRoot: *, hashes: *, oldRoot: *, pathIndices: string}}}
 */
function batchTreeUpdate(tree: any, events: any[]) {
  const batchHeight = Math.log2(events.length)
  if (!Number.isInteger(batchHeight)) {
    throw new Error('events length has to be power of 2')
  }

  const oldRoot = tree.root.toString()
  const leaves = events.map((e) => sliceHash([e.instance, e.hash, e.timestamp]))
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
    hashes: events.map((e) => BigNumber.from(e.hash).toString()),
    timestamps: events.map((e) => BigNumber.from(e.timestamp).toString()),
    argsHash: '',
  }

  input.argsHash = hashInputs(input)
  const args = [
    toFixedHex(input.argsHash),
    toFixedHex(input.oldRoot),
    toFixedHex(input.newRoot),
    toFixedHex(input.pathIndices, 4),
    events.map((e) => ({
      hash: toFixedHex(e.hash),
      instance: toFixedHex(BigNumber.from(get32BitsOfInstance(e.instance)), 4),
      timestamp: toFixedHex(e.timestamp, 4),
    })),
  ]
  return {input, args}
}
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
  // let codeMaster: Cell;
  // let codeWallet: Cell;

  beforeAll(async () => {
    code = await compile('TonnelTree');
    // codeMaster = await compile('JettonMinter');
    // codeWallet = await compile('JettonWallet');


  });

  let blockchain: Blockchain;
  let tonnelTree: SandboxContract<TonnelTree>;
  let owner: SandboxContract<TreasuryContract>;
  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');
    // tonnelJettonMaster = blockchain.openContract(JettonMinter.createFromConfig({
    //   adminAddress: owner.address,
    //   content: "https://api.tonnel.network/jetton/metadata",
    //   jettonWalletCode: codeWallet
    // }, codeMaster));

    const deployer = await blockchain.treasury('deployer');
    // const deployJettonResult = await tonnelJettonMaster.sendDeploy(owner.getSender(), toNano('0.05'));
    // expect(deployJettonResult.transactions).toHaveTransaction({
    //   from: owner.address,
    //   to: tonnelJettonMaster.address,
    //   deploy: true,
    //   success: true,
    // });

    tonnelTree = blockchain.openContract(
        TonnelTree.createFromConfig(
            {
              ownerAddress: owner.address,
            },
            code
        )
    );


    const deployResult = await tonnelTree.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: tonnelTree.address,
      deploy: true,
      success: true,
    });
    // await tonnelJettonMaster.sendMintAccess(owner.getSender(),{
    //   value: toNano('0.02'),
    //   queryId: 0,
    //   mintAccess: tonnel.address
    // })
    // expect(deployResult.transactions).toHaveTransaction({
    //   from: deployer.address,
    //   to: tonnel.address,
    //   deploy: true,
    //   success: true,
    // });


  });

  const registerDeposit = async (commitment: bigint, pool: { getSender: () => Sender; address: any; }) => {
    const depositResult = await tonnelTree.sendRegisterDeposit(pool.getSender(), {
      value: toNano('0.02'),
      commitment: BigInt(commitment),
    });
    expect(depositResult.transactions).toHaveTransaction({
        from: pool.address,
        to: tonnelTree.address,
        success: true,
        });
    return depositResult.transactions[0].now

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
    const tree = new MerkleTree(20, [], { hashFunction: mimcHash2 })
    const events = []

    for (let i = 0; i < 32; i++) {
      const poolSender = await blockchain.treasury('pool' + i % 2);

      const randomBuf = rbuffer(31);
      const randomBuf2 = rbuffer(31);
      const nullifier = toBigIntLE(randomBuf2);
      const secret = toBigIntLE(randomBuf);
      const commitment = mimcHash2(secret.toString(), nullifier.toString());
      const nullifierHash = mimcHash2(nullifier.toString(), nullifier.toString());
      const t = await registerDeposit(commitment, poolSender);
      events.push({
        instance: poolSender.address,
        hash: commitment,
        timestamp: t,
        instance32Bit: get32BitsOfInstance(poolSender.address)
      })
      // console.log(t)
      // await registerWithdraw(nullifierHash)
    }
    // console.log(events)
    const { input } = batchTreeUpdate(tree, events)
    let encodedSliceArray = []
    for (let i = 0; i < 32; i+=3) {
      if (i < 30) {
        encodedSliceArray.push(
            beginCell()
                .storeUint(BigInt(input.hashes[i]), 256).storeUint(BigInt(input.instances[i]), 32).storeUint(BigInt(input.timestamps[i]), 32)
                .storeUint(BigInt(input.hashes[i + 1]), 256).storeUint(BigInt(input.instances[i + 1]), 32).storeUint(BigInt(input.timestamps[i + 1]), 32)
                .storeUint(BigInt(input.hashes[i + 2]), 256).storeUint(BigInt(input.instances[i + 2]), 32).storeUint(BigInt(input.timestamps[i + 2]), 32)
                .endCell().beginParse()
        )
      } else {
        encodedSliceArray.push(
            beginCell()
                .storeUint(BigInt(input.hashes[i]), 256).storeUint(BigInt(input.instances[i]), 32).storeUint(BigInt(input.timestamps[i]), 32)
                .storeUint(BigInt(input.hashes[i + 1]), 256).storeUint(BigInt(input.instances[i + 1]), 32).storeUint(BigInt(input.timestamps[i + 1]), 32)
                .endCell().beginParse()
        )
      }
    }
    const updateResult = await tonnelTree.sendUpdateDepositRoot(owner.getSender(), {
        value: toNano('1'),
      a: beginCell().endCell(),
      b: beginCell().endCell(),
      c: beginCell().endCell(),
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
    console.log('after-1', await tonnelTree.getBalance());





    // const tree = new MerkleTree(20, [], {
    //   hashFunction: mimcHash2,
    //   zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    // });
    // const rootInit = await tonnel.getLastRoot();
    // expect(BigInt(tree.root)).toEqual(rootInit);
    // console.log('before', Number(await tonnel.getBalance()) / 1000000000);
    //
    // const sender = await blockchain.treasury('sender');
    //
    //
    //
    // const old_root = tree.root;
    //
    // tree.insert(commitment);
    //
    // const root = tree.root;
    // const { pathElements, pathIndices } = tree.path(tree.elements.length - 1)
    //
    //
    // let input = {
    //   oldRoot: old_root,
    //   newRoot: root,
    //   leaf: commitment,
    //   pathIndices: tree.elements.length - 1,
    //   pathElements: pathElements,
    // }
    // console.log(input)
    // const time = Date.now()
    // let {proof, publicSignals} = await groth16.fullProve(input,
    //     wasmPathInsert, zkeyPathInsert);
    // // console.log(proof, publicSignals)
    // // console.log(Date.now() - time)
    // let verify = await groth16.verify(vkeyInsert, publicSignals, proof);
    // expect(verify).toEqual(true);
    // let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    // let B_y = proof.pi_b[1].map((num: string) => BigInt(num))
    // const payload = beginCell()
    //     .storeRef(parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))))
    //     .storeRef(parseG2Func(B_x[0], B_x[1], B_y))
    //     .storeRef(parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
    //     )
    //     .endCell()
    //
    // const depositResult = await tonnel.sendDeposit(sender.getSender(), {
    //   value: toNano((deposit_fee + pool_size * (1 + fee)).toFixed(9)),
    //   commitment: BigInt(commitment),
    //   newRoot: BigInt(root),
    //     oldRoot: BigInt(old_root),
    //   payload: payload
    // });
    //
    //
    // console.log('before1', Number(await tonnel.getBalance()) / 1000000000);
    //
    // expect(depositResult.transactions).toHaveTransaction({
    //   from: sender.address,
    //   to: tonnel.address,
    //   success: true,
    // });
    //
    // expect(depositResult.transactions).toHaveTransaction({
    //   from: tonnel.address,
    //   to: owner.address,
    //   success: true,
    //   value: toNano((pool_size * fee).toFixed(9)),
    // });
    //
    // expect(depositResult.transactions).toHaveTransaction({
    //   from: tonnel.address,
    //   to: tonnelJettonMaster.address,
    //   success: true,
    // })
    // const jettonWalletDepositorContract = await blockchain.openContract(
    //   JettonWallet.createFromAddress(await tonnelJettonMaster.getWalletAddress(sender.address)))
    // expect(depositResult.transactions).toHaveTransaction({
    //   from: tonnelJettonMaster.address,
    //   to: jettonWalletDepositorContract.address,
    //   success: true,
    // })
    //
    //
    //
    // expect(await jettonWalletDepositorContract.getBalance()).toEqual(toNano(1))
    //
    // expect(await tonnel.getBalance()).toBeGreaterThan(toNano(pool_size))
    //
    // const rootAfter = await tonnel.getLastRoot();
    // console.log(rootAfter)
    // console.log('after', Number(await tonnel.getBalance()) / 1000000000);
    // console.log(await tonnel.getMinStuck())
    // let {proof: proof2, publicSignals: publicSignals2} = await groth16.fullProve(input,
    //     wasmPathInsert, zkeyPathInsert);
    // // console.log(proof, publicSignals)
    // // console.log(Date.now() - time)
    // let verify2 = await groth16.verify(vkeyInsert, publicSignals2, proof2);
    // expect(verify2).toEqual(true);
    // let B_x2 = proof2.pi_b[0].map((num: string) => BigInt(num))
    // let B_y2 = proof2.pi_b[1].map((num: string) => BigInt(num))
    // const payloadGood = beginCell()
    //     .storeRef(parseG1Func(proof2.pi_a.slice(0,2).map((num: string ) => BigInt(num))))
    //     .storeRef(parseG2Func(B_x2[0], B_x2[1], B_y2))
    //     .storeRef(parseG1Func(proof2.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
    //     )
    //     .endCell()
    //
    // const stuckFixResult = await tonnel.sendRemoveMinStuck(sender.getSender(), {
    //   value: toNano((0.2).toFixed(9)),
    //   commitment: BigInt(commitment),
    //   newRoot: BigInt(root),
    //   oldRoot: BigInt(old_root),
    //   payload: payloadGood
    // });
    //
    // expect(stuckFixResult.transactions).toHaveTransaction({
    //   from: sender.address,
    //   to: tonnel.address,
    //   success: true,
    // });
    // console.log(await tonnel.getMinStuck())

  }, 500000);


});
