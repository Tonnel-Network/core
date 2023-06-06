import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from 'ton-core';

export type TonnelConfig = {
};

export function tonnelConfigToCell(config: TonnelConfig): Cell {
    return beginCell().endCell();
}

export const Opcodes = {
    increase: 0x3b3cca17,
};

export class Tonnel implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Tonnel(address);
    }

    static createFromConfig(config: TonnelConfig, code: Cell, workchain = 0) {
        const data = tonnelConfigToCell(config);
        const init = { code, data };
        return new Tonnel(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendIncrease(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.increase, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .endCell(),
        });
    }

}
