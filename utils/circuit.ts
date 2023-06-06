import crypto from "crypto";
// @ts-ignore
import { groth16 } from "snarkjs";
// @ts-ignore
import circomlib from "circomlib";

/** Generate random buffer of specified byte length */
const rbuffer = (nbytes: number) => crypto.randomBytes(nbytes);

/** Compute pedersen hash */
function pedersenHash(data: Buffer): BigInt {
  return circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0];
}

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

export { genProofArgs, unstringifyBigInts, toBigIntLE, rbuffer, pedersenHash, groth16 };
