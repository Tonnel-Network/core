import {Blockchain, SandboxContract} from '@ton-community/sandbox';
import {beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {NFTCollection} from "../wrappers/NFTCollection";
import {JettonWallet} from "../wrappers/JettonWallet";
import {NFTItem} from "../wrappers/NFTItem";

describe('NFTCollection', () => {
  let code: Cell;
  let codeItem: Cell;

  beforeAll(async () => {
    code = await compile('NFTCollection');
    codeItem = await compile('NFTItem');
  });

  let blockchain: Blockchain;
  let nftCollection: SandboxContract<NFTCollection>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    nftCollection = blockchain.openContract(NFTCollection.createFromConfig({
      adminAddress: (await blockchain.treasury('owner')).address,
      nftItemCode: codeItem,
    }, code));

    const deployer = await blockchain.treasury('deployer');

    const deployResult = await nftCollection.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: nftCollection.address,
      deploy: true,
      success: true,
    });
  });

  it('should deploy and mint', async () => {
    const owner = await blockchain.treasury('owner');
    for (let i = 0; i < 10; i++) {
      const mintResult = await nftCollection.sendMint(owner.getSender(), {
        toAddress: owner.address,
        value: toNano('0.07')
      });
      expect(mintResult.transactions).toHaveTransaction({
        from: owner.address,
        to: nftCollection.address,
        success: true
      });

      const nftItem = await nftCollection.getAddress(BigInt(i));
      expect(mintResult.transactions).toHaveTransaction({
        from: nftCollection.address,
        to: nftItem,
        success: true
      });
    }

    // non allowed mint
    const mintResult = await nftCollection.sendMint(owner.getSender(), {
      toAddress: owner.address,
      value: toNano('0.07')
    });
    expect(mintResult.transactions).toHaveTransaction({
      from: owner.address,
      to: nftCollection.address,
      success: false,
      exitCode: 104
    });

  });

  it('should deploy and change price and then mint', async () => {
    const owner = await blockchain.treasury('owner');
    const transferDest = await blockchain.treasury('transferDest');
    const changePriceResult = await nftCollection.sendChangePrice(owner.getSender(), {
      value: toNano('0.02'),
      many: 0,
      price: 0
    });
    expect(changePriceResult.transactions).toHaveTransaction({
      from: owner.address,
      to: nftCollection.address,
      success: true
    });
    let mintResult = await nftCollection.sendMint(owner.getSender(), {
      toAddress: owner.address,
      value: toNano('0.07')
    });
    expect(mintResult.transactions).toHaveTransaction({
      from: owner.address,
      to: nftCollection.address,
      success: false,
      exitCode: 104
    });
    await nftCollection.sendChangePrice(owner.getSender(), {
      value: toNano('0.02'),
      many: 5,
      price: 1
    });
    for (let i = 0; i < 5; i++) {
      mintResult = await nftCollection.sendMint(owner.getSender(), {
        toAddress: owner.address,
        value: toNano('1.07')
      });
      expect(mintResult.transactions).toHaveTransaction({
        from: owner.address,
        to: nftCollection.address,
        success: true
      });

      const nftItem = await nftCollection.getAddress(BigInt(i));
      expect(mintResult.transactions).toHaveTransaction({
        from: nftCollection.address,
        to: nftItem,
        success: true
      });
      const nftItemContract = await blockchain.openContract(
        NFTItem.createFromAddress(await nftCollection.getAddress(BigInt(i ))));
      const transferResult = await nftItemContract.sendTransfer(owner.getSender(), {
        toAddress: transferDest.address,
        value: toNano('0.04')
      });
      expect(transferResult.transactions).toHaveTransaction({
        from: owner.address,
        to: nftItemContract.address,
        success: true
      });

      const transferResultFailed = await nftItemContract.sendTransfer(owner.getSender(), {
        toAddress: transferDest.address,
        value: toNano('0.07')
      });
      const nftData = await nftItemContract.getContent()
      expect(transferResultFailed.transactions).toHaveTransaction({
        from: owner.address,
        to: nftItemContract.address,
        success: false,
        exitCode: 401
      });

    }

    // non allowed mint
    mintResult = await nftCollection.sendMint(owner.getSender(), {
      toAddress: owner.address,
      value: toNano('0.07')
    });
    expect(mintResult.transactions).toHaveTransaction({
      from: owner.address,
      to: nftCollection.address,
      success: false,
      exitCode: 104
    });

  });
});