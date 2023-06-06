import { Address, toNano } from 'ton-core';
import { Tonnel } from '../wrappers/Tonnel';
import { NetworkProvider, sleep } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Tonnel address'));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const tonnel = provider.open(Tonnel.createFromAddress(address));


    await tonnel.sendIncrease(provider.sender(), {
        value: toNano('0.05'),
    });


    ui.clearActionPrompt();
    ui.write('Counter increased successfully!');
}
