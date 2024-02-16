import {
    Address,
    beginCell, Builder,
    Cell,
    Contract,
    contractAddress,
    ContractProvider, Dictionary,
    Sender,
    SendMode, toNano, TupleItemCell
} from 'ton-core';
import {TupleItemSlice} from "ton-core/dist/tuple/tuple";
import {CellRef} from "./ZKNFTCollection";

export type TonnelTreeConfig = {
  ownerAddress: Address;
  JettonAddress: Address;
  minerAddress: Address;
};

export function tonnelConfigToCell(config: TonnelTreeConfig): Cell {

    return beginCell()
      .storeRef(
          beginCell()
              // .storeUint(BigInt('43859932230369129483580312926473830336086498799745261185663267638134570341235'), 256)
              .storeUint(BigInt('25416488001500592750831851833222150514626956728948310222978720675196770330485'), 256)
              .storeUint(BigInt('0'), 256)
              .storeUint(0, 32)
              .storeUint(0, 32)
              .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(32), CellRef))
              .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(256), CellRef))
              .endCell()
      )
        .storeRef(
            beginCell()
                // .storeUint(BigInt('43859932230369129483580312926473830336086498799745261185663267638134570341235'), 256)
                .storeUint(BigInt('22614051121781559972052913768501660456524670246973068400452260998473472130300'), 256)
                .storeUint(BigInt('0'), 256)
                .storeUint(0, 32)
                .storeUint(0, 32)
                .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(32), CellRef))
                .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(256), CellRef))

                .endCell()
        )
    .storeRef(
        beginCell()
            .storeAddress(config.ownerAddress)
            .storeAddress(config.minerAddress)
            .storeAddress(config.JettonAddress)
            .storeCoins(toNano('0.2'))

            .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(256), CellRef))

            .endCell()
    ).endCell();
}

export const Opcodes = {
    register_deposit: 0x888,
    register_withdraw: 0x777,
    update_deposit_root: 0x666,
    update_withdraw_root: 0x555,
    add_pool: 0x444,
    reward: 0x333,
    set_miner: 0x222,

};
// const error::unknown_op = 101;
// const error::access_denied = 102;
// const error::fund = 103;
// const error::verify_failed = 104;
// const error::verify_failed_fee = 105;
// const error::verify_failed_root = 106;
// const error::verify_failed_double_spend = 107;
export const ERRORS = {
  verify_failed_root: 106,
  verify_failed_double_spend: 107,
  unknown_op: 101,
  access_denied: 102,
  fund: 103,
  verify_failed: 104,
  verify_failed_fee: 105,

};

export class TonnelTree implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new TonnelTree(address);
  }

  static createFromConfig(config: TonnelTreeConfig, code: Cell, workchain = 0) {
    const data = tonnelConfigToCell(config);
    const init = {code, data};
    return new TonnelTree(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendRegisterDeposit(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryID?: number;
      commitment: bigint;
    }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.register_deposit, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeRef(beginCell().storeUint(opts.commitment, 256).endCell())
        .endCell(),
    });
  }

    async sendRegisterWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            nullifierHash: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.register_withdraw, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeRef(beginCell().storeUint(opts.nullifierHash, 256).endCell())
                .endCell(),
        });
    }

    async sendAddPool(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            pool: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.add_pool, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeAddress(opts.pool)
                .endCell(),
        });
    }

    async sendSetMiner(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            miner: Address;
            miner_fee: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.set_miner, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeAddress(opts.miner)
                .storeCoins(opts.miner_fee)
                .endCell(),
        });
    }

    async sendRewardRequest(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            reward_payload: Builder;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.reward, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeBuilder(opts.reward_payload)
                .endCell(),
        });
    }


    async sendUpdateDepositRoot(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            a: Cell;
            b: Cell;
            c: Cell;


            _currentRoot: bigint;
            _argsHash: bigint;
            _newRoot: bigint;
            _pathIndices: number;
            events: Cell;
            opcode?: number;
        }
    ) {
        console.log(opts.events)
        const inputCell = beginCell()
            .storeUint(opts.opcode ?? Opcodes.update_deposit_root, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeRef(
                beginCell()
                    .storeUint(opts._argsHash, 256)
                    .storeUint(opts._currentRoot, 256)
                    .storeUint(opts._newRoot, 256)
                    .storeUint(opts._pathIndices, 32)
                    .storeRef(
                        beginCell().storeRef(opts.a).storeRef(opts.b)
                            .storeRef(opts.c).endCell()
                ).storeRef(
                    opts.events
                )
                    .endCell()
            )
            .endCell()
        const check = await this.getCheckVerify(provider, inputCell, (opts.opcode ?? Opcodes.update_deposit_root) === Opcodes.update_deposit_root);
        console.log(check)
        if (check !== 1) {
            throw new Error(`Withdraw check failed: ${check}`);
        }
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: inputCell,
        });
    }

  async getCheckVerify(provider: ContractProvider, cell: Cell, deposit = false) {
      let funcname = 'check_verify_withdraw'
      if (deposit) {
            funcname = 'check_verify_deposit'

      }
    const result = await provider.get(funcname, [
      {type: 'slice', cell: cell} as TupleItemSlice,
    ]);
    console.log(result.stack)
    return result.stack.readNumber();
  }

  async getBalance(provider: ContractProvider) {
    const result = await provider.getState();
    return result.balance;
  }

}
