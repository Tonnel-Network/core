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
import {get32BitsOfInstance} from "../tests/TonnelTree.spec";
import {TupleItemSlice} from "ton-core/dist/tuple/tuple";

export type MinerConfig = {
    JettonMasterAddress: Address;
    ADMIN_ADDRESS: Address;
    REWARD_SWAP_ADDRESS: Address;
    TONNEL_TREE_ADDRESS: Address;
};

const CellRef: DictionaryValue<Cell> = {
    serialize: (src, builder) => {
        builder.storeSlice(src.beginParse())
    },
    parse: (src) => src.asCell(),
}

export function tonnelConfigToCell(config: MinerConfig): Cell {

    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), CellRef)
    dict.set(BigInt(0), beginCell().storeUint(43859932230369129483580312926473830336086498799745261185663267638134570341235n, 256).endCell())
    return beginCell()
        .storeUint(0, 32)
        .storeRef(beginCell().storeDict(null).storeDict(null).storeDict(null).storeDict(dict).endCell())
        .storeRef(
            beginCell()
                .storeAddress(config.ADMIN_ADDRESS)
                .storeAddress(config.REWARD_SWAP_ADDRESS)
            .storeAddress(config.TONNEL_TREE_ADDRESS)
                .endCell())
        .endCell();

}

export const Opcodes = {
    reward: 0x777,
    withdraw: 0x666,
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

    async sendWithdraw(provider: ContractProvider, via: Sender, opts: {
        value: bigint;

        amount: bigint;
        fee: bigint;
        recipient: Address;

        input_root: bigint;
        input_nullifier_hash: bigint;
        output_root: bigint;
        output_path_index: bigint;
        output_commitment: bigint;
        proof_withdraw: Cell;

        old_root: bigint;
        new_root: bigint;
        leaf: bigint;
        path_index: bigint;

    }) {
        const ext_cell = beginCell().storeCoins(opts.fee).storeAddress(opts.recipient).endCell();
        const hash = BigInt("0x" + ext_cell.hash().toString('hex'))
        const input_cell = beginCell().storeUint(Opcodes.withdraw, 32)
            .storeUint(0, 64)
            .storeCoins(opts.amount).storeUint(hash, 256).storeCoins(opts.fee).storeAddress(opts.recipient)
            .storeRef(
                beginCell()
                    .storeUint(opts.input_root, 256)
                    .storeUint(opts.input_nullifier_hash, 256)
                    .storeUint(opts.output_root, 256)
                    .storeUint(opts.output_path_index, 32)
                    .storeRef(
                        beginCell()
                            .storeUint(opts.output_commitment, 256)
                            .endCell()
                    )
                    .storeRef(
                        opts.proof_withdraw
                    )
                    .endCell()
            )
            .storeRef(
                beginCell()
                    .storeUint(opts.old_root, 256)
                    .storeUint(opts.new_root, 256)
                    .storeUint(opts.leaf, 256)
                    .storeUint(opts.path_index, 32)
                    .storeRef(beginCell().endCell())//todo proof insert
                    .endCell()
            )

            .endCell();


        const check = await this.getCheckVerify(provider, input_cell, false);
        console.log(check)
        if (check !== 1) {
            throw new Error(`Withdraw check failed: ${check}`);
        }

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: input_cell,
        });
    }


    async sendSetRate(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        pool: number;
        rate: bigint;

    }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(112, 32)
                .storeUint(0, 64)
                .storeUint(opts.rate, 32)
                .storeUint(opts.pool, 32)
                .endCell(),
        });
    }


    async getBalance(provider: ContractProvider) {
        const result = await provider.getState();
        return result.balance;
    }

    async getAccountCount(provider: ContractProvider) {
        const result = await provider.get('get_account_count', [
        ]);
        return result.stack.readNumber();
    }

    async getRewardNullifier(provider: ContractProvider, nullifier: bigint) {
        const result = await provider.get('get_reward_nullifiers', [
            {type: 'int', value: nullifier}
        ]);
        return result.stack.readBoolean();
    }

    async getaccountNullifiers(provider: ContractProvider, nullifier: bigint) {
        const result = await provider.get('get_account_nullifiers', [
            {type: 'int', value: nullifier}
        ]);
        return result.stack.readBoolean();
    }

    async getCheckVerify(provider: ContractProvider, cell: Cell, reward = false) {
        let funcname = 'check_verify_withdraw'
        if (reward) {
            funcname = 'check_verify_reward'

        }
        const result = await provider.get(funcname, [
            {type: 'slice', cell: cell} as TupleItemSlice,
        ]);
        console.log(result.stack)
        return result.stack.readNumber();
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
