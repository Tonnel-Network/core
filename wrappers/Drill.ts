import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode, toNano
} from 'ton-core';
import {TupleItemSlice} from "ton-core/dist/tuple/tuple";

export type DrillConfig = {
  ownerAddress: Address;
  rewardMinterAddress: Address;
  lpMinterAddress: Address;
  lpBytecode: Cell;
};

export function drillConfigToCell(config: DrillConfig): Cell {

  return beginCell().storeAddress(config.ownerAddress)
      .storeDict(null)
      .storeRef(beginCell().storeAddress(config.rewardMinterAddress).storeAddress(config.lpMinterAddress)
        .storeRef(config.lpBytecode).endCell())
      .storeRef(
            beginCell().storeUint(0,64).storeUint(0,256).storeUint(0,256)
                .endCell()
      )
      .endCell();
}

export const Opcodes = {
  withdraw: 3406020527,
  emeregency_withdraw: 3831112322,
};
// const error::unknown_op = 101;
// const error::access_denied = 102;
// const error::fund = 103;
// const error::verify_failed = 104;
// const error::verify_failed_fee = 105;
// const error::verify_failed_root = 106;
// const error::verify_failed_double_spend = 107;
export const ERRORS = {


};

export class Drill implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new Drill(address);
  }

  static createFromConfig(config: DrillConfig, code: Cell, workchain = 0) {
    const data = drillConfigToCell(config);
    const init = {code, data};
    return new Drill(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendWithdraw(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryID?: number;
      amount: bigint;
    }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.withdraw, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeCoins(opts.amount)
        .endCell(),
    });
  }


  async sendEmergencyWithdraw(
      provider: ContractProvider,
      via: Sender,
      opts: {
        value: bigint;
        queryID?: number;
        amount: bigint;
      }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
          .storeUint(Opcodes.emeregency_withdraw, 32)
          .storeUint(opts.queryID ?? 0, 64)
          .storeCoins(opts.amount)
          .endCell(),
    });
  }
  async getBalance(provider: ContractProvider) {
    const result = await provider.getState();
    return result.balance;
  }

  async getUserState(provider: ContractProvider, sender: Address) {
    try {
      const result = await provider.get('get_user_state', [
        {type: 'slice',
          cell: beginCell().storeAddress(sender).endCell()
        },
      ]);
      return [result.stack.readBigNumber(), result.stack.readBigNumber(), result.stack.readBigNumber(), result.stack.readBigNumber(), result.stack.readBigNumber()];
    } catch (e) {
      return 0;
    }

  }

}
