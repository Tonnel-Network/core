import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider, Dictionary, DictionaryValue,
    Sender,
    SendMode, toNano
} from 'ton-core';

export type MinerConfig = {
    JettonMasterAddress: Address;
    ADMIN_ADDRESS: Address;
    MINER_ADDRESS: Address;
    start: number;
};

const CellRef: DictionaryValue<Cell> = {
    serialize: (src, builder) => {
        builder.storeSlice(src.beginParse())
    },
    parse: (src) => src.asCell(),
}

export function tonnelConfigToCell(config: MinerConfig): Cell {

    return beginCell().storeAddress(config.JettonMasterAddress)
        .storeAddress(config.ADMIN_ADDRESS)
        .storeAddress(config.MINER_ADDRESS)
        .storeUint(config.start, 32)
        .storeCoins(0)
        .endCell();

}

export const Opcodes = {
    swap: 0x777,
};
export const ERRORS = {

};

export class Miner implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new Miner(address);
    }

    static createFromConfig(config: MinerConfig, code: Cell, workchain = 0) {
        const data = tonnelConfigToCell(config);
        const init = {code, data};
        return new Miner(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendSwap(provider: ContractProvider, via: Sender, value: bigint, howMuch: bigint, to: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.swap, 32)
                .storeUint(0, 64)
                .storeCoins(howMuch).
                storeAddress(to).endCell(),
        });
    }

    async getBalance(provider: ContractProvider) {
        const result = await provider.getState();
        return result.balance;
    }

    async getExpectedReturn(provider: ContractProvider, amount: bigint) {
        const result = await provider.get('get_expected_return', [
            {type: 'int', value: amount},
        ]);
        return result.stack.readBigNumber();
    }


    async getTONNELVirtualBalance(provider: ContractProvider) {
        const result = await provider.get('get_tonnel_virtual_balance', []);
        return result.stack.readBigNumber();
    }


    async getTokenSold(provider: ContractProvider) {
        const result = await provider.get('get_token_sold', []);
        return result.stack.readBigNumber();
    }


}
