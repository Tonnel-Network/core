import crypto from "crypto";
// @ts-ignore
import { groth16 } from "snarkjs";
import {beginCell} from "ton-core";

/** Generate random buffer of specified byte length */
const rbuffer = (nbytes: number) => crypto.randomBytes(nbytes);

async function genProofArgs(proof: any, pub: any) {
  proof = unstringifyBigInts(proof);
  pub = unstringifyBigInts(pub);
  const calldata = await groth16.exportSolidityCallData(proof, pub);
  const args = JSON.parse("[" + calldata + "]");
  return args;
}

// source: https://github.com/iden3/ffjavascript/blob/master/src/utils_bigint.js
function unstringifyBigInts(o: any): any {
  if (typeof o == "string" && /^[0-9]+$/.test(o)) {
    return BigInt(o);
  } else if (Array.isArray(o)) {
    return o.map(unstringifyBigInts);
  } else if (typeof o == "object") {
    const res: any = {};
    const keys = Object.keys(o);
    keys.forEach(k => {
      res[k] = unstringifyBigInts(o[k]);
    });
    return res;
  } else {
    return o;
  }
}

// source: https://github.com/no2chem/bigint-buffer/blob/c4d61b5c4fcaab36c55130840e906c162dfce646/src/index.ts#L25
function toBigIntLE(buf: Buffer) {
  const reversed = Buffer.from(buf);
  reversed.reverse();
  const hex = reversed.toString("hex");
  if (hex.length === 0) {
    return BigInt(0);
  }
  return BigInt(`0x${hex}`);
}

export function parseG1Func(G1: bigint[]) {
  let num = G1[0]
  let y = BigInt(G1[1])
  y *= 2n;
  y /= 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
  // padding to 381 bits
  let flag = y.toString(2)
  let cell = beginCell()
  num = BigInt(num)
  const bin  = num.toString(2)
  // padding to 384 bits
  const padding =  "10" + flag + bin.padStart(381, '0')
  // print each 48 bits
  for (let i = 0; i < padding.length; i += 48) {
    const chunk = padding.slice(i, i + 48)
    const dec = BigInt('0b' + chunk)
    // code += `.store_uint(${dec.toString(10)}, 48)`
    cell.storeUint(dec, 48)
  }

  return cell.endCell()

}
export function parseG2Func(num0: any, num1: any, ys:any) {
  let cell = beginCell()
  // a_flag1 = (y_im * 2) // q if y_im > 0 else (y_re * 2) // q python code
  let flag0
  if(ys[1] > 0) {
    ys[1] *= 2n;
    ys[1] /= 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
    flag0 = ys[1].toString(2)
  } else {
    ys[0] *= 2n;
    ys[0] /= 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
    flag0 = ys[0].toString(2)
  }
  // console.log(flag0)

  num1 = BigInt(num1)
  // console.log(num.toString(10))
  let bin  = num1.toString(2)
// padding to 384 bits
  let padding =  "10" + flag0 + bin.padStart(381, '0')
  for (let i = 0; i < padding.length; i += 96) {
    const chunk = padding.slice(i, i + 96)

    const dec = BigInt('0b' + chunk)
    // console.log(dec)
    cell.storeUint(dec, 96)
  }
  bin  = num0.toString(2)
// padding to 384 bits
  padding =  "000" + bin.padStart(381, '0')
  for (let i = 0; i < padding.length; i += 96) {
    const chunk = padding.slice(i, i + 96)
    const dec = BigInt('0b' + chunk)
    // console.log(dec)
    cell.storeUint(dec, 96)
  }
  return cell.endCell()

}
export { genProofArgs, unstringifyBigInts, toBigIntLE, rbuffer, groth16};
