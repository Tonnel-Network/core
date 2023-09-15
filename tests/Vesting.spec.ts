import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {Address, beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {ERRORS, Vesting} from "../wrappers/Vesting";
import {JettonMinter} from "../wrappers/JettonMinter";
import {JettonWallet} from "../wrappers/JettonWallet";



describe('Vesting', () => {
  let code: Cell;
  let codeWallet: Cell;
  let codeMaster: Cell;
  async function getJettonBalance(address: Address) {
    const jettonWallet = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)))
    return (await jettonWallet.getBalance());
  }
  beforeAll(async () => {
    code = await compile('Vesting');
    codeWallet = await compile('JettonWallet');
    codeMaster = await compile('JettonMinter');

  });

  let blockchain: Blockchain;
  let vesting: SandboxContract<Vesting>;
  let owner: SandboxContract<TreasuryContract>;
  let jettonMaster: SandboxContract<JettonMinter>;


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


    vesting = blockchain.openContract(
      Vesting.createFromConfig(
        {
          WHITELIST: [
            {address: (await blockchain.treasury('sender1')).address, amount: toNano('1000')},
            {address: (await blockchain.treasury('sender2')).address, amount: toNano('2000')},
            {address: (await blockchain.treasury('sender3')).address, amount: toNano('1500')},
            {address: (await blockchain.treasury('sender4')).address, amount: toNano('3000')},
          ],
          JettonMasterAddress: jettonMaster.address,
        },
        code
      )
    );


    const deployResult = await vesting.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: vesting.address,
      deploy: true,
      success: true,
    });
    await jettonMaster.sendMintAccess(owner.getSender(),{
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: vesting.address
    })

  });

  it('should deploy and claim tonnel', async () => {
    let senders = []
    for (let i = 1; i < 5; i++) {
        senders.push(await blockchain.treasury('sender' + i));
    }
    for (let i = 0; i < 4; i++) {
      blockchain.now = 1692550800 + (1 * 60 * 60 * 24 * 30);
      let balancesBefore = await getJettonBalance(senders[i].address)
      console.log(balancesBefore)
      let claimResult = await vesting.sendClaimTONNEL(senders[i].getSender(), toNano('0.05'), toNano('3001'));

      expect(claimResult.transactions).toHaveTransaction({
        from: senders[i].address,
        to: vesting.address,
        success: false,
        exitCode: ERRORS.cliff_not_passed
      });
      let balancesAfter = await getJettonBalance(senders[i].address)
      console.log(balancesAfter)
    }
    for (let i = 0; i < 4; i++) {

      // @ts-ignore
      blockchain.now += (4 * 60 * 60 * 24 * 30);
      const getState = await vesting.getState(senders[i].address);
      console.log(getState)
      let claimResult = await vesting.sendClaimTONNEL(senders[i].getSender(), toNano('0.05'), toNano('3001'));

      expect(claimResult.transactions).toHaveTransaction({
        from: senders[i].address,
        to: vesting.address,
        success: true,
      })
      let balancesAfter = await getJettonBalance(senders[i].address)
      console.log(balancesAfter)
      expect(balancesAfter ).toBe(getState);
    }

    for (let i = 0; i < 4; i++) {

      // @ts-ignore
      const getState = await vesting.getState(senders[i].address);
      console.log(getState)
      let claimResult = await vesting.sendClaimTONNEL(senders[i].getSender(), toNano('0.05'), toNano('3001'));

      expect(claimResult.transactions).toHaveTransaction({
        from: senders[i].address,
        to: vesting.address,
        success: false,
        exitCode: ERRORS.fully_claimed
      })
    }

    let claimResult = await vesting.sendClaimTONNEL(owner.getSender(), toNano('0.05'), toNano('3001'));
    expect(claimResult.transactions).toHaveTransaction({
      from: owner.address,
      to: vesting.address,
      success: false,
      exitCode: ERRORS.whitelist
    })

  }, 10000);

});