import { toNano } from 'ton-core';
import { Tonnel } from '../wrappers/Tonnel';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
    const tonnel = provider.open(
        Tonnel.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
                counter: 0,
            },
            await compile('Tonnel')
        )
    );

    await tonnel.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(tonnel.address);
}
