import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {Address, beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {JettonMinter} from "../wrappers/JettonMinter";
import {JettonWallet} from "../wrappers/JettonWallet";
import {APSwap} from "../wrappers/APSwap";



describe('APSwap', () => {
  let code: Cell;
  let codeWallet: Cell;
  let codeMaster: Cell;
  async function getJettonBalance(address: Address) {
    const jettonWallet = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)))
    return (await jettonWallet.getBalance());
  }
  beforeAll(async () => {
    code = await compile('APSwap');
    codeWallet = await compile('JettonWallet');
    codeMaster = await compile('JettonMinter');

  });

  let blockchain: Blockchain;
  let apswap: SandboxContract<APSwap>;
  let owner: SandboxContract<TreasuryContract>;
  let jettonMaster: SandboxContract<JettonMinter>;
  let start_time = 0;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');

    const deployer = await blockchain.treasury('deployer');
    jettonMaster = blockchain.openContract(JettonMinter.createFromConfig({
      adminAddress: owner.address,
      content: "",
      jettonWalletCode: codeWallet
    }, codeMaster));
    const deployJettonResult = await jettonMaster.sendDeploy(owner.getSender(), toNano('0.05'));
    expect(deployJettonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: jettonMaster.address,
      deploy: true,
      success: true,
    });


    apswap = blockchain.openContract(
      APSwap.createFromConfig(
        {
          JettonMasterAddress: jettonMaster.address,
            ADMIN_ADDRESS: owner.address,
            MINER_ADDRESS: owner.address,
            start: deployJettonResult.transactions[0].now
        },
        code
      )
    );
    start_time = deployJettonResult.transactions[0].now;


    const deployResult = await apswap.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: apswap.address,
      deploy: true,
      success: true,
    });
    await jettonMaster.sendMintAccess(owner.getSender(),{
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: apswap.address
    })

  });
  it('should deploy and check', async () => {
    let ONE_DAY = 86400;
    blockchain.now = start_time + ONE_DAY * 364;
    // console.log(await apswap.getTONNELVirtualBalance());
    console.log(await apswap.getExpectedReturn(BigInt(100 * 86400)));
    console.log(await apswap.getExpectedReturn(BigInt(10 * 86400)));
  for (let i = 0; i < 100; i++) {
    const resSwap = await apswap.sendSwap(owner.getSender(),
        toNano('0.1'),
        BigInt(100 * 86400),
        owner.address
    );
    expect(resSwap.transactions).toHaveTransaction({
      from: owner.address,
      to: apswap.address,
      success: true,
    });
    console.log(await apswap.getTokenSold());
  }


    console.log(await apswap.getExpectedReturn(BigInt(100 * 86400)));
    console.log(await apswap.getExpectedReturn(BigInt(10 * 86400)));

  });



});