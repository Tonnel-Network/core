import { Blockchain, SandboxContract } from '@ton-community/sandbox';
import { Cell, toNano } from 'ton-core';
import { Tonnel } from '../wrappers/Tonnel';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

describe('Tonnel', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Tonnel');
    });

    let blockchain: Blockchain;
    let tonnel: SandboxContract<Tonnel>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        tonnel = blockchain.openContract(
            Tonnel.createFromConfig(
                {
                },
                code
            )
        );

        const deployer = await blockchain.treasury('deployer');

        const deployResult = await tonnel.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonnel.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and tonnel are ready to use
    });

    it('should pass verify', async () => {
        const increaseTimes = 3;
        for (let i = 0; i < increaseTimes; i++) {
            console.log(`increase ${i + 1}/${increaseTimes}`);

            const increaser = await blockchain.treasury('increaser' + i);



            const increaseResult = await tonnel.sendIncrease(increaser.getSender(), {
                value: toNano('1'),
            });

            expect(increaseResult.transactions).toHaveTransaction({
                from: increaser.address,
                to: tonnel.address,
                success: true,
            });


        }
    });
});
