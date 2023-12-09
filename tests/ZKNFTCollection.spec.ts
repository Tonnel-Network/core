import {Blockchain, SandboxContract} from '@ton-community/sandbox';
import {Address, beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {ZKNFTCollection} from "../wrappers/ZKNFTCollection";
import {
  groth16,
  rbuffer,
  toBigIntLE,
  unstringifyBigInts
} from "../utils/circuit";
import {bitsToNumber, mimcHash, mimcHash2, Sha256} from "../utils/merkleTree";
import path from "path";
import {parseG1Func, parseG2Func} from "./Tonnel.spec";
import {NFTItem} from "../wrappers/NFTItem";
import {JettonMinter} from "../wrappers/JettonMinter";
import {JettonWallet} from "../wrappers/JettonWallet";
const wasmPath = path.join(__dirname, "../build/transfer circom/circuit.wasm");
const wasmPathInsert = path.join(__dirname, "../build/insert/circuit.wasm");
const wasmPathReveal = path.join(__dirname, "../build/reveal circom/circuit.wasm");
const zkeyPath = path.join(__dirname, "../build/transfer circom/circuit_final.zkey");
const zkeyPathInsert = path.join(__dirname, "../build/insert/circuit_final.zkey");
const zkeyPathReveal = path.join(__dirname, "../build/reveal circom/circuit_final.zkey");

const vkeyPath = path.join(__dirname, "../build/transfer circom/verification_key.json");
const vkeyRevealPath = path.join(__dirname, "../build/reveal circom/verification_key.json");
const vkeyInsertPath = path.join(__dirname, "../build/insert/verification_key.json");
import MerkleTree from 'fixed-merkle-tree';
// import a json file
const vkey = require(vkeyPath);
const vkeyReveal = require(vkeyRevealPath);
const vkeyInsert = require(vkeyInsertPath);

describe('ZKNFTCollection', () => {
  let code: Cell;
  let codeItem: Cell;
  let codeWallet: Cell;
  let codeMaster: Cell;

  beforeAll(async () => {
    code = await compile('ZKNFTCollection');
    codeItem = await compile('NFTItem');
  });

  let blockchain: Blockchain;
  let nftCollection: SandboxContract<ZKNFTCollection>;
  let jettonMinter: SandboxContract<JettonMinter>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    codeWallet = await compile('JettonWallet');
    codeMaster = await compile('JettonMinter');
    jettonMinter = blockchain.openContract(JettonMinter.createFromConfig({
      adminAddress: (await blockchain.treasury('owner')).address,
      content: "",
      jettonWalletCode: codeWallet
    }, codeMaster));

    let deployJettonResult = await jettonMinter.sendDeploy((await blockchain.treasury('owner')).getSender(), toNano('0.05'));
    expect(deployJettonResult.transactions).toHaveTransaction({
      from: (await blockchain.treasury('owner')).address,
      to: jettonMinter.address,
      deploy: true,
      success: true,
    });

    nftCollection = blockchain.openContract(ZKNFTCollection.createFromConfig({
      adminAddress: (await blockchain.treasury('owner')).address,
      nftItemCode: codeItem,
      masterJetton: jettonMinter.address,
      jettonWalletCell: codeWallet,
      discounts: [
        (await blockchain.treasury('sender1')).address,
        (await blockchain.treasury('sender2')).address,
        (await blockchain.treasury('sender3')).address,
        (await blockchain.treasury('sender4')).address,
      ]
    }, code));
    await jettonMinter.sendMintAccess((await blockchain.treasury('owner')).getSender(),{
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: nftCollection.address
    })
    const deployer = await blockchain.treasury('deployer');

    const deployResult = await nftCollection.sendDeploy(deployer.getSender(), toNano('1'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: nftCollection.address,
      deploy: true,
      success: true,
    });



  });
  const mintNFT = async (id: number, secret: bigint, tree: MerkleTree) => {
    const owner = await blockchain.treasury('owner');
    const commitment = mimcHash2(BigInt(id), secret);
    // const rootInit = await nftCollection.getLastRoot();
    // expect(BigInt(tree.root())).toEqual(rootInit);
    // console.log(await nftCollection.getBalance() / 1000000n);


  //   const jettonWalletMinter = blockchain.openContract(
  //     JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(minter.address)))
  // const jettonWalletOwner = blockchain.openContract(
  //     JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner.address)))

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

    let mintResult = await nftCollection.sendMintOwner(owner.getSender(), {
      value: toNano('0.2'),
      fwd_amount: toNano('0.02'),
      payload: beginCell().storeUint(BigInt(commitment), 256)
          .storeUint(id, 32)
          .storeUint(BigInt(root), 256)
          .storeRef(
              beginCell()
                  .storeRef(parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))))
                  .storeRef(parseG2Func(B_x[0], B_x[1], B_y))
                  .storeRef(parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
                  )
                  .endCell())
          .endCell(),
    });
    const nftAddress = await nftCollection.getAddress(BigInt(id));
    const nftItemContract = blockchain.openContract(
      NFTItem.createFromAddress(nftAddress));
    expect(mintResult.transactions).toHaveTransaction({
      from: nftCollection.address,
      to: nftItemContract.address,
      success: true
    });


    const rootAfter = await nftCollection.getLastRoot();
    expect(BigInt(tree.root)).toEqual(rootAfter);
    // console.log(await nftCollection.getBalance() / 1000000n);

    const ownerNFT = await nftItemContract.getOwner();
    expect(ownerNFT).toEqualAddress(nftCollection.address);
    return {commitment};
  }
  it('should deploy and then mint', async () => {
    const tree = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
        zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    });
    const listSecrets= [];
    const prices = []
    for (let i = 1; i < 34; i++) {
      const randomBuf = rbuffer(31);
      const secret = toBigIntLE(randomBuf);
      const id = i;
      listSecrets.push(secret);
      // ;;(333 + 66 * level)

      prices.push(333 + 66 * i);
      const {commitment} = await mintNFT(id, secret, tree);
    }
    console.log(await nftCollection.getBalance())
    const jettonWalletCollection = blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(nftCollection.address)))
    const burnJettonWallet = blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(Address.parse(
            'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'
        ))))
    for (let i = 1; i < 50; i++) {

      const sender = await blockchain.treasury('sender' + i);
      const owner = await blockchain.treasury('owner');
      const jettonWalletSender = blockchain.openContract(
          JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

      const resultMint = await jettonMinter.sendMint(
        owner.getSender()
        ,  {
        toAddress: sender.address,
        jettonAmount: toNano('10000'),
        amount: toNano('0.02'),
        queryId: 1,
        value: toNano('0.07')
      });
      expect(resultMint.transactions).toHaveTransaction({
        from: jettonMinter.address,
        to: jettonWalletSender.address,
        success: true
      })
      const beforeBalance = await burnJettonWallet.getBalance();

      const senderBalance = await jettonWalletSender.getBalance();
      console.log(senderBalance)

      let purchaseResult = await jettonWalletSender.sendTransfer(sender.getSender(), {
         value: toNano('0.15'),
         toAddress: nftCollection.address,
         queryId: 0,
         fwdAmount: toNano('0.1'),
         jettonAmount: toNano(prices[
             i < 33 ? i - 1 : 32
             ]),
         fwdPayload: beginCell()
             .endCell(),
       })

        expect(purchaseResult.transactions).toHaveTransaction({
            from: jettonWalletCollection.address,
            to: nftCollection.address,
            success: true
        })
      expect(purchaseResult.transactions).toHaveTransaction({
        from: nftCollection.address,
        to: jettonWalletCollection.address,
        success: true
      })
      if (i <= 4){
        expect(purchaseResult.transactions).toHaveTransaction({
          from: jettonWalletCollection.address,
          to: jettonWalletSender.address,
          success: true
        })
      }


      const afterBalance = await burnJettonWallet.getBalance();
      const senderBalanceAfter = await jettonWalletSender.getBalance();
      if (i < 34) {
        if (i > 4)
        {
          expect(senderBalance - senderBalanceAfter).toEqual(toNano(prices[i - 1]));
          expect(afterBalance - beforeBalance).toEqual(toNano(prices[i - 1]));

        }
        else
        {
          console.log(prices[i - 1] *  0.89)
          expect(senderBalance - senderBalanceAfter ).toEqual(toNano((prices[i - 1] *  0.89).toFixed(9)));
          expect(afterBalance - beforeBalance).toEqual(toNano((prices[i - 1] *  0.89).toFixed(9)));

        }

      }

    }
    expect(await jettonWalletCollection.getBalance()).toEqual(toNano('0'));


  }, 100000000);

  it('should deploy and then mint and transfer private', async () => {
    const tree = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    });
    const newOwner = await blockchain.treasury('newOwner');
    const listSecrets= [0n];
    const listCommitments = ['0'];
    for (let i = 1; i < 3; i++) {
      const randomBuf = rbuffer(31);
      const secret = toBigIntLE(randomBuf);
      const id = i;
      listSecrets.push(secret);
      // ;;(333 + 66 * level)

      const {commitment} = await mintNFT(id, secret, tree);
      console.log(commitment)
      listCommitments.push(commitment);

    }
    const id = 1;
    const lastRoot = tree.root;
    const merkleProof = tree.proof(listCommitments[id]);
    const newSecret = toBigIntLE(rbuffer(31));

    tree.insert(mimcHash2(id.toString(), newSecret.toString()));

    let input = {
      root: lastRoot,
      id: id,
      secret: listSecrets[id].toString(),
      newCommitment: mimcHash2(id.toString(), newSecret.toString()),
      nullifier: mimcHash2(listSecrets[id].toString(), id.toString()),
      pathElements: merkleProof.pathElements,
      pathIndices: merkleProof.pathIndices,
      lastRoot: lastRoot,
      newRoot: tree.root,
      pathIndicesTreeUpdate: tree.elements.length - 1,
      pathElementsTreeUpdate: tree.path(tree.elements.length - 1).pathElements,
    };


    let {proof, publicSignals} = await groth16.fullProve(input, wasmPath, zkeyPath);
    console.log(proof, publicSignals)

    let verify = await groth16.verify(vkey, publicSignals, proof);
    console.log(verify)
    expect(verify).toEqual(true);
    let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    let B_y = proof.pi_b[1].map((num: string) => BigInt(num))


    const owner = await blockchain.treasury('owner');



    const transferResult = await nftCollection.sendTransfer(owner.getSender(), {
      value: toNano("0.17"),
      root: BigInt(lastRoot),
      nullifier: mimcHash2(listSecrets[id].toString(), id.toString()),
      newCommitment: mimcHash2(id.toString(), newSecret.toString()),
      newRoot: BigInt(tree.root),
      a: parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
      b: parseG2Func(B_x[0], B_x[1], B_y),
      c: parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
    });
    expect(transferResult.transactions).toHaveTransaction({
      from: nftCollection.address,
      to: jettonMinter.address,
      success: true
    })
    expect(BigInt(tree.root)).toEqual(await nftCollection.getLastRoot());
    const randomBufNew = rbuffer(31);
    const newSecret2 = toBigIntLE(randomBufNew);

    const merkleProof2 = tree.proof(mimcHash2(id.toString(), newSecret.toString()));
    tree.insert(mimcHash2(id.toString(), newSecret2.toString()));
    input = {
      root: merkleProof2.pathRoot,
      id: id,
      secret: newSecret.toString(),
      newCommitment: mimcHash2(id.toString(), newSecret2.toString()),
      nullifier: mimcHash2(newSecret.toString(), id.toString()),
      pathElements: merkleProof2.pathElements,
      pathIndices: merkleProof2.pathIndices,
      lastRoot: merkleProof2.pathRoot,
      newRoot: tree.root,
      pathIndicesTreeUpdate: tree.elements.length - 1,
      pathElementsTreeUpdate: tree.path(tree.elements.length - 1).pathElements,
    };


    const {proof: proof2, publicSignals: publicSignals2} = await groth16.fullProve(input, wasmPath, zkeyPath);
    console.log(proof2, publicSignals2)


    verify = await groth16.verify(vkey, publicSignals2, proof2);
    console.log(verify)
    expect(verify).toEqual(true);
    B_x = proof2.pi_b[0].map((num: string) => BigInt(num))
    B_y = proof2.pi_b[1].map((num: string) => BigInt(num))


    const transferResult2 = await nftCollection.sendTransfer(owner.getSender(), {
      value: toNano("0.17"),
      newRoot: BigInt(tree.root),
      root: BigInt(publicSignals2[2]),
      nullifier: BigInt(publicSignals2[0]),
      newCommitment: BigInt(publicSignals2[1]),
      a: parseG1Func(proof2.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
      b: parseG2Func(B_x[0], B_x[1], B_y),
      c: parseG1Func(proof2.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
    });
    expect(transferResult2.transactions).toHaveTransaction({
      from: nftCollection.address,
      to: jettonMinter.address,
      success: true
    })

  }, 100000000);

  it('should deploy and then mint and reveal', async () => {
    const tree = new MerkleTree(20, [], {
      hashFunction: mimcHash2,
      zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
    });
    const newOwner = await blockchain.treasury('newOwner');
    const newOwnerSlice = beginCell().storeAddress(newOwner.address).endCell();
    const listSecrets= [0n];
    const prices = [0]
    for (let i = 1; i < 3; i++) {
      const randomBuf = rbuffer(31);
      const secret = toBigIntLE(randomBuf);
      const id = i;
      listSecrets.push(secret);
      // ;;(333 + 66 * level)

      prices.push(333 + 66 * i);
      const {commitment} = await mintNFT(id, secret, tree);
      console.log(commitment)

    }
    const id = 2;
    const { pathElements, pathIndices } = tree.path(id - 1)

    let input = {
      root: tree.root,
      id: id,
      secret: listSecrets[id].toString(),
      address: newOwnerSlice.beginParse().loadUintBig(256),
      pathElements: pathElements,
      pathIndices: pathIndices,
      nullifier: mimcHash2(listSecrets[id].toString(), id.toString()),
    }
    console.log(input)

    let {proof, publicSignals} = await groth16.fullProve(input, wasmPathReveal, zkeyPathReveal);
      let verify = await groth16.verify(vkeyReveal, publicSignals, proof);
      console.log(verify)
      expect(verify).toEqual(true);
      let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
      let B_y = proof.pi_b[1].map((num: string) => BigInt(num))
      let known = await nftCollection.getRootKnown(BigInt(tree.root));
      expect(known).toEqual(1);

      const revealResult = await nftCollection.sendReveal(newOwner.getSender(), {
        value: toNano("0.15"),
        nullifier: mimcHash2(listSecrets[id].toString(), id.toString()),
        id: id,
        newOwner: newOwner.address,
        root: BigInt(tree.root),
        a: parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
        b: parseG2Func(B_x[0], B_x[1], B_y),
        c: parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
      });
      expect(revealResult.transactions).toHaveTransaction({
        from: newOwner.address,
        to: nftCollection.address,
        success: true
      })
      const nftAddress = await nftCollection.getAddress(BigInt(id));
      expect(revealResult.transactions).toHaveTransaction({
        from: nftCollection.address,
        to: nftAddress,
        success: true
      })

      const nftItemContract = blockchain.openContract(
        NFTItem.createFromAddress(nftAddress));
      let ownerNFT = await nftItemContract.getOwner();
      expect(ownerNFT).toEqualAddress(newOwner.address);



      // then should hide
      const randomBufNew = rbuffer(31);
      const newSecret2 = toBigIntLE(randomBufNew);
    const old_root = tree.root;

    tree.insert(mimcHash2(id.toString(), newSecret2.toString()));

    const root = tree.root;
    const path = tree.path(tree.elements.length - 1)


    let input2 = {
      oldRoot: old_root,
      newRoot: root,
      leaf: mimcHash2(id.toString(), newSecret2.toString()),
      pathIndices: tree.elements.length - 1,
      pathElements: path.pathElements,
    }
    let {proof: proofInsert, publicSignals: publicSignalsInsert} = await groth16.fullProve(input2,
        wasmPathInsert, zkeyPathInsert);
    // console.log(proof, publicSignals)
    // console.log(Date.now() - time)
    let verify2 = await groth16.verify(vkeyInsert, publicSignalsInsert, proofInsert);
    expect(verify2).toEqual(true);
    const proofInsertCopy = {...proofInsert};
    let B_x2 = proofInsert.pi_b[0].map((num: string) => BigInt(num))
    let B_y2 = proofInsert.pi_b[1].map((num: string) => BigInt(num))

      const hideResult = await nftItemContract.sendToHide(newOwner.getSender(), {
        toAddress: nftCollection.address,
        value: toNano("0.2"),
        commitment: BigInt(Sha256(id.toString(), newSecret2.toString())),
        id: id,
        payload: beginCell().storeUint(BigInt(root), 256).storeUint(BigInt(old_root), 256)
            .storeRef(
                beginCell()
                    .storeRef(parseG1Func(proofInsert.pi_c.slice(0,2).map((num: string ) => BigInt(num))))
                    .storeRef(parseG2Func(B_x2[0], B_x2[1], B_y2))
                    .storeRef(parseG1Func(proofInsert.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
                    )
                    .endCell())
      })
      expect(hideResult.transactions).toHaveTransaction({
        from: nftItemContract.address,
        to: nftCollection.address,
        success: true
      })
      //  expect(hideResult.transactions).toHaveTransaction({
      //   from: nftCollection.address,
      //   to: nftCollection.address,
      //   success: true
      // })



      ownerNFT = await nftItemContract.getOwner();
      expect(ownerNFT).toEqualAddress(nftCollection.address);

      const jetttonWalletOwner = blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(newOwner.address)))
      const jetttonWalletRelayer = blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(newOwner.address)))
      console.log(await jetttonWalletOwner.getBalance())
      console.log(await jetttonWalletRelayer.getBalance())
    console.log(await nftCollection.getMinStuck())
    console.log(await nftCollection.getLastRoot())
    let B_x3 = proofInsert.pi_b[0].map((num: string) => BigInt(num))
    let B_y3 = proofInsert.pi_b[1].map((num: string) => BigInt(num))

    const stuckFixResult = await nftCollection.sendRemoveMinStuck(newOwner.getSender(), {
      value: toNano((0.2).toFixed(9)),
      commitment: BigInt(Sha256(id.toString(), newSecret2.toString())),
      newRoot: BigInt(root),
      oldRoot: BigInt(old_root),
      payload: beginCell()
          .storeRef(parseG1Func(proofInsertCopy.pi_a.slice(0,2).map((num: string ) => BigInt(num))))
          .storeRef(parseG2Func(B_x3[0], B_x3[1], B_y3))
          .storeRef(parseG1Func(proofInsertCopy.pi_c.slice(0,2).map((num: string ) => BigInt(num)))
          )
          .endCell()
    });

    expect(stuckFixResult.transactions).toHaveTransaction({
      from: newOwner.address,
      to: nftCollection.address,
      success: true,
    });
    console.log(await nftCollection.getMinStuck())
    expect(BigInt(tree.root)).toEqual(await nftCollection.getLastRoot());

  },100000000);
});