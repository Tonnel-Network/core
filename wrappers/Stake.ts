import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode
} from 'ton-core';

export type StakeConfig = {
  jettonMinterAddress: Address;
  jettonWalletBytecode: Cell;
};

export function tonnelConfigToCell(config: StakeConfig): Cell {

  return beginCell().storeDict(null).storeRef(beginCell().storeAddress(config.jettonMinterAddress).storeRef(config.jettonWalletBytecode).endCell()).endCell();
}
export const Opcodes = {
  stake_TON: 777,
  stake_TONNEL: 778,
  withdraw_TON: 779,
  withdraw_TONNEL: 780,
};
// const error::not_staked = 700;
// const error::not_enough = 701;
export const ERRORS = {
  not_staked: 700,
  not_enough: 701

};

export class Stake implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new Stake(address);
  }

  static createFromConfig(config: StakeConfig, code: Cell, workchain = 0) {
    const data = tonnelConfigToCell(config);
    const init = {code, data};
    return new Stake(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendStakeTON(
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
        .storeUint(Opcodes.stake_TON, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .endCell(),
    });
  }

  async sendWithdrawTON(
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
        .storeUint(Opcodes.withdraw_TON, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeCoins(opts.amount)
        .endCell(),
    });
  }
  async sendWithdrawTONNEL(
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
        .storeUint(Opcodes.withdraw_TONNEL, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeCoins(opts.amount)
        .endCell(),
    });
  }

  async getBalance(provider: ContractProvider) {
    const result = await provider.getState();
    return result.balance;
  }

}
