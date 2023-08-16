import {Blockchain, SandboxContract} from '@ton-community/sandbox';
import {beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {ZKNFTCollection} from "../wrappers/ZKNFTCollection";
import {groth16, rbuffer, toBigIntLE} from "../utils/circuit";
import {MerkleTree, Sha256} from "../utils/merkleTree";
import path from "path";
import {parseG1Func, parseG2Func} from "./Tonnel.spec";
import {NFTItem} from "../wrappers/NFTItem";
import {JettonMinter} from "../wrappers/JettonMinter";
import {JettonWallet} from "../wrappers/JettonWallet";
const wasmPath = path.join(__dirname, "../build/transfer circom/circuit.wasm");
const wasmPathReveal = path.join(__dirname, "../build/reveal circom/circuit.wasm");
const zkeyPath = path.join(__dirname, "../build/transfer circom/circuit_final.zkey");
const zkeyPathReveal = path.join(__dirname, "../build/reveal circom/circuit_final.zkey");
const vkeyPath = path.join(__dirname, "../build/transfer circom/verification_key.json");
const vkeyRevealPath = path.join(__dirname, "../build/reveal circom/verification_key.json");

// import a json file
const vkey = require(vkeyPath);
const vkeyReveal = require(vkeyRevealPath);

describe('ZKNFTCollection', () => {
  let code: Cell;
  let codeItem: Cell;
  let codeWallet: Cell;
  let codeMaster: Cell;
  async function merkleInitialize() {
    const initSlice = 2;
    for (let i = 0; i < initSlice; i++) {
      // console.log(`init ${i + 1}/${initSlice}`);

      const init_account = await blockchain.treasury('increaser' + i);


      const increaseResult = await nftCollection.sendContinue(init_account.getSender(), {
        value: toNano('0.8'),
      });

      expect(increaseResult.transactions).toHaveTransaction({
        from: init_account.address,
        to: nftCollection.address,
        success: true,
      });


    }
  }

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

    await merkleInitialize();


  });
  const mintNFT = async (id: number, secret: bigint, tree: MerkleTree) => {
    const minter = await blockchain.treasury('minter');
    const owner = await blockchain.treasury('owner');
    const commitment = Sha256(id.toString(), secret.toString());
    const rootInit = await nftCollection.getLastRoot();
    expect(BigInt(tree.root())).toEqual(rootInit);
    // console.log(await nftCollection.getBalance() / 1000000n);
    await jettonMinter.sendMint(
      owner.getSender()
      ,  {
      toAddress: minter.address,
      jettonAmount: toNano('1000'),
      amount: toNano('0.02'),
      queryId: 1,
      value: toNano('0.05')

    });

    const jettonWalletMinter = blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(minter.address)))
  const jettonWalletOwner = blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner.address)))


    let mintResult = await jettonWalletMinter.sendTransfer(minter.getSender(), {
      value: toNano('1.45'),
      toAddress: nftCollection.address,
      queryId: 0,
      fwdAmount: toNano('1.4'),
      jettonAmount: toNano('1000'),
      fwdPayload: beginCell()
        .storeCoins(toNano('0.02')) // gas fee
        .storeRef(beginCell().storeUint(BigInt(commitment), 256).storeUint(id, 32).endCell())
        .endCell(),
    });
    console.log(await jettonWalletMinter.getBalance())
    console.log(await jettonWalletOwner.getBalance())
    expect(mintResult.transactions).toHaveTransaction({
      from: nftCollection.address,
      to: nftCollection.address,
      success: true
    });
    const nftAddress = await nftCollection.getAddress(BigInt(id));
    const nftItemContract = blockchain.openContract(
      NFTItem.createFromAddress(nftAddress));
    expect(mintResult.transactions).toHaveTransaction({
      from: nftCollection.address,
      to: nftItemContract.address,
      success: true
    });


    tree.insert(commitment);

    const rootAfter = await nftCollection.getLastRoot();
    expect(BigInt(tree.root())).toEqual(rootAfter);
    // console.log(await nftCollection.getBalance() / 1000000n);

    const ownerNFT = await nftItemContract.getOwner();
    expect(ownerNFT).toEqualAddress(nftCollection.address);
    return {commitment};
  }
  it('should deploy and then mint', async () => {
    const tree = new MerkleTree(20);
    for (let i = 0; i < 10; i++) {
      const randomBuf = rbuffer(31);
      const secret = toBigIntLE(randomBuf);
      const id = i;

      const {commitment} = await mintNFT(id, secret, tree);
    }


  });

  it('should deploy and then mint and transfer private', async () => {
    const randomBuf = rbuffer(31);
    const randomBuf2 = rbuffer(31);
    // const secret = toBigIntLE(randomBuf);
    const secret = 374173982223592588982890232743312907402024842004440599621797430445070595324n;
    const newSecret = toBigIntLE(randomBuf2);

    const id = 0;
    const tree = new MerkleTree(20);

    const {commitment} = await mintNFT(id, secret, tree);
    const leaf = tree.getIndex(commitment);
    const merkleProof = tree.proof(leaf);
    console.log(secret.toString())
    console.log(newSecret.toString())
    let input = {
      root: tree.root(),
      id: id,
      secret: secret.toString(),
      newSecret: newSecret.toString(),
      newCommitment: Sha256(id.toString(), newSecret.toString()),
      nullifier: Sha256(secret.toString(), id.toString()),// should be changed to reverse

      pathElements: merkleProof.pathElements,
      pathIndices: merkleProof.pathIndices,
    };


    let {proof, publicSignals} = await groth16.fullProve(input, wasmPath, zkeyPath);
    console.log(proof, publicSignals)

    let verify = await groth16.verify(vkey, publicSignals, proof);
    console.log(verify)
    expect(verify).toEqual(true);
    let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
    let B_y = proof.pi_b[1].map((num: string) => BigInt(num))
    let known = await nftCollection.getRootKnown(BigInt(tree.root()));
    expect(known).toEqual(1);

    const owner = await blockchain.treasury('owner');


    const transferResult = await nftCollection.sendTransfer(owner.getSender(), {
      value: toNano("1.55"),
      root: BigInt(publicSignals[2]),
      nullifier: BigInt(publicSignals[0]),
      newCommitment: BigInt(publicSignals[1]),
      a: parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
      b: parseG2Func(B_x[0], B_x[1], B_y),
      c: parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
    });
    expect(transferResult.transactions).toHaveTransaction({
      from: nftCollection.address,
      to: nftCollection.address,
      success: true
    })

    tree.insert(publicSignals[1]);
    expect(BigInt(tree.root())).toEqual(await nftCollection.getLastRoot());
    const randomBufNew = rbuffer(31);
    const newSecret2 = toBigIntLE(randomBufNew);
    console.log(newSecret2.toString())
    const leaf2 = tree.getIndex(publicSignals[1]);
    const merkleProof2 = tree.proof(leaf2);

    input = {
      root: tree.root(),
      id: id,
      secret: newSecret.toString(),
      newSecret: newSecret2.toString(),
      newCommitment: Sha256(id.toString(), newSecret2.toString()),
      nullifier: Sha256(newSecret.toString(), id.toString()),// should be changed to reverse

      pathElements: merkleProof2.pathElements,
      pathIndices: merkleProof2.pathIndices,
    };


    const {proof: proof2, publicSignals: publicSignals2} = await groth16.fullProve(input, wasmPath, zkeyPath);
    console.log(proof2, publicSignals2)


    verify = await groth16.verify(vkey, publicSignals2, proof2);
    console.log(verify)
    expect(verify).toEqual(true);
    B_x = proof2.pi_b[0].map((num: string) => BigInt(num))
    B_y = proof2.pi_b[1].map((num: string) => BigInt(num))
    known = await nftCollection.getRootKnown(BigInt(tree.root()));
    expect(known).toEqual(1);


    const transferResult2 = await nftCollection.sendTransfer(owner.getSender(), {
      value: toNano("1.55"),
      root: BigInt(publicSignals2[2]),
      nullifier: BigInt(publicSignals2[0]),
      newCommitment: BigInt(publicSignals2[1]),
      a: parseG1Func(proof2.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
      b: parseG2Func(B_x[0], B_x[1], B_y),
      c: parseG1Func(proof2.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
    });
    expect(transferResult2.transactions).toHaveTransaction({
      from: nftCollection.address,
      to: nftCollection.address,
      success: true
    })

  }, 100000000);

  it('should deploy and then mint and reveal', async () => {
    const tree = new MerkleTree(20);
    const newOwner = await blockchain.treasury('newOwner');
    const newOwnerSlice = beginCell().storeAddress(newOwner.address).endCell();
    for (let i = 0; i < 1; i++) {
      const randomBuf = rbuffer(31);
      // const secret = toBigIntLE(randomBuf);
      const secret = 169761882942218304444494151566684912204411823489975688556022234969441140324n;
      const id = i;

      const {commitment} = await mintNFT(id, secret, tree);
      const leaf = tree.getIndex(commitment);
      const merkleProof = tree.proof(leaf);
      console.log(secret.toString())
      let input = {
        root: tree.root() ,
        id: id,
        secret: secret.toString(),
        address: newOwnerSlice.beginParse().loadUintBig(256),
        pathElements: merkleProof.pathElements,
        pathIndices: merkleProof.pathIndices,
        nullifier: Sha256(secret.toString(), id.toString()),// should be changed to reverse
      }
      console.log(input)

      // let {proof, publicSignals} = await groth16.fullProve(input, wasmPathReveal, zkeyPathReveal);
      // console.log(proof, publicSignals)
      const proof = {
        pi_a: [
          '3579626208057591819362958330594840983016361229849387233022423576430664404549487050292392799430060688450850654435399',
          '149611584791585391014690646441136284429758416780936461374893253824385694947843117824441096749408949847310077012970',
          '1'
        ],
        pi_b: [
          [
            '3625330736896957191192049526166861598585849461954119025057207916567292433292557184380363153622486663106217099076931',
            '4933546822593852500965187641120373916103303063543864447450571121028599574978081493511972730243979319039111901709'
          ],
          [
            '1459954989520190989176429201691352333821370222578532030707115196716855432297717857050071074013545434463879921742151',
            '3190830362788915067312319389800858880593818039593494827771642732844588294325261769049930583577348581478287455735924'
          ],
          [ '1', '0' ]
        ],
        pi_c: [
          '3745369641383691625618507254528959730733113454816449239011022921608912249043002961800417938446832580041624791005533',
          '915561429309340496527463299234067009164301999971666070316285949206793733272116389796335050671334760526604216014225',
          '1'
        ],
        protocol: 'groth16',
        curve: 'bls12381'
      }
      const publicSignals = [
        '21065412687758656656667909203140116316855076641539695339436577966373612838460',
          '0',
          '5474410705641251093926627450646259109009340401886935415668738371221639773862',
          '1874863312974046374036444654468754476774534849088164672660613699685978640718'
        ]
      let verify = await groth16.verify(vkeyReveal, publicSignals, proof);
      console.log(verify)
      expect(verify).toEqual(true);
      let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
      let B_y = proof.pi_b[1].map((num: string) => BigInt(num))
      let known = await nftCollection.getRootKnown(BigInt(tree.root()));
      expect(known).toEqual(1);

      const relayer = await blockchain.treasury('relayer');


      const revealResult = await nftCollection.sendReveal(relayer.getSender(), {
        value: toNano("0.15"),
        nullifier: BigInt(publicSignals[0]) ,
        id: id,
        newOwner: newOwner.address,
        root: BigInt(publicSignals[3]),
        a: parseG1Func(proof.pi_a.slice(0,2).map((num: string ) => BigInt(num))),
        b: parseG2Func(B_x[0], B_x[1], B_y),
        c: parseG1Func(proof.pi_c.slice(0,2).map((num: string ) => BigInt(num))),
      });
      expect(revealResult.transactions).toHaveTransaction({
        from: relayer.address,
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
      console.log(nftCollection.address.toString())
      console.log(ownerNFT.toString())
      console.log(newOwner.address.toString())
      console.log(relayer.address.toString())
      expect(ownerNFT).toEqualAddress(newOwner.address);

      expect(BigInt(tree.root())).toEqual(await nftCollection.getLastRoot());


      // then should hide
      const randomBufNew = rbuffer(31);
      const newSecret2 = toBigIntLE(randomBufNew);

      const hideResult = await nftItemContract.sendToHide(newOwner.getSender(), {
        toAddress: nftCollection.address,
        value: toNano("1.55"),
        commitment: BigInt(Sha256(id.toString(), newSecret2.toString())),
        id: id,
      })
      expect(hideResult.transactions).toHaveTransaction({
        from: nftItemContract.address,
        to: nftCollection.address,
        success: true
      })
       expect(hideResult.transactions).toHaveTransaction({
        from: nftCollection.address,
        to: nftCollection.address,
        success: true
      })
      tree.insert(Sha256(id.toString(), newSecret2.toString()));
      expect(BigInt(tree.root())).toEqual(await nftCollection.getLastRoot());



      ownerNFT = await nftItemContract.getOwner();
      expect(ownerNFT).toEqualAddress(nftCollection.address);

      const jetttonWalletOwner = blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(newOwner.address)))
      const jetttonWalletRelayer = blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(relayer.address)))
      console.log(await jetttonWalletOwner.getBalance())
      console.log(await jetttonWalletRelayer.getBalance())




    }

  },100000000);
});