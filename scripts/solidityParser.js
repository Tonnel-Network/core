const fs = require('fs');
const path = require('path');
const VERIFIER_SOLIDITY_PATH = path.resolve('./Verifier.sol');
const FUNC_TEMPLATE_FILE = path.resolve('./template.fc');
const source = fs.readFileSync(VERIFIER_SOLIDITY_PATH, 'utf8');
let func_template = fs.readFileSync(FUNC_TEMPLATE_FILE, 'utf8');
const groth16 = require('snarkjs').groth16;

const wasmPath = path.join(__dirname, "../build/circuits/circuit.wasm");
const zkeyPath = path.join(__dirname, "../build/circuits/circuit_final.zkey");


const {g2Parser} = require("../utils/G2Parser");
const {g1Parser} = require("../utils/G1Parser");
const assert = require("assert");
const regex = /function\s+verifyingKey\(\)\s+internal\s+pure\s+returns\s+\(VerifyingKey\s+memory\s+vk\)\s+\{([\s\S]*?)\}/gm;
const matches = regex.exec(source);
const verifyingKey = matches[1];


const g1Points = verifyingKey.match(/Pairing\.G1Point\((\s*\d+,\s*\d+\s*)\)/g)
const g2Points = verifyingKey.match(/Pairing\.G2Point\(\s*\[(\s*\d+,\s*\d+\s*)\],\s*\[(\s*\d+,\s*\d+\s*)\]\s*\)/g)

const g1PointsArray = g1Points.map((point) => {
    const pointArray = point.match(/\d+/g)
    return pointArray.slice(1, 3).map((num) => BigInt(num))
  }
)


const g2PointsArray = g2Points.map((point) => {
    const pointArray = point.match(/\d+/g)
    return pointArray.slice(1, 5).map((num) => BigInt(num))

  }
)

let insert_code = ""

insert_code += `
        ;;
        ;;
        ;; Verifying Key constants 
        ;;
        ;;
        
`
const alf1 = g1PointsArray[0]
const ICs = g1PointsArray.slice(1)

const beta2 = g2PointsArray[0].slice(0, 2)
const gamma2 = g2PointsArray[1].slice(0, 2)
const delta2 = g2PointsArray[2].slice(0, 2)

insert_code += "       \n       "

insert_code += g1Parser(alf1, 'alf1')
insert_code += "       \n       "

ICs.forEach((IC, index) => {
  insert_code += g1Parser(IC, `IC${index}`)
  insert_code += "       \n       "

})


insert_code += g2Parser(beta2[1], beta2[0], g2PointsArray[0].slice(2, 4).reverse(), 'beta2')
insert_code += "       \n       "
insert_code += g2Parser(gamma2[1], gamma2[0], g2PointsArray[1].slice(2, 4).reverse(), 'gamma2')
insert_code += "       \n       "

insert_code += g2Parser(delta2[1], delta2[0], g2PointsArray[2].slice(2, 4).reverse(), 'delta2')
insert_code += "       \n       "

// random integer for testing
const a = Math.floor(Math.random() * 100000000)
const b = Math.floor(Math.random() * 100000000)
const input = {
    a, b
  }
;

groth16.fullProve(input, wasmPath, zkeyPath).then(({proof, publicSignals})=>{

  const A = proof.pi_a.slice(0,2).map((num) => BigInt(num))
  const B_x = proof.pi_b[0].map((num) => BigInt(num))
  const B_y  = proof.pi_b[1].map((num) => BigInt(num))
  const C = proof.pi_c.slice(0,2).map((num) => BigInt(num))

  insert_code += `
      ;;
      ;;
      ;; Proof inputs 
      ;;
      ;;
       
`
  insert_code += "       \n       "

  insert_code += g1Parser(A, 'A')
  insert_code += "       \n       "

  insert_code += g2Parser(B_x[0], B_x[1], B_y, 'B')
  insert_code += "       \n       "

  insert_code += g1Parser(C, 'C')
  insert_code += "       \n       "

  insert_code += "slice vk_x = IC0;"
  insert_code += "       \n       "

  for (let i = 1; i < ICs.length; i++) {
    insert_code += `vk_x = bls_g1_add(vk_x, bls_g1_mul(IC${i}, ${publicSignals[i - 1]}));`
    insert_code += "       \n       "

  }

  insert_code += `
      ;; pairing check
        
      slice neg_a = bls_g1_negate(A);
      int success = bls_pairing_check(neg_a,
                      B,
                      alf1,
                      beta2,
                      vk_x,
                      gamma2,
                      C,
                      delta2,
                      4);
`
  // console.log(insert_code)
  func_template = func_template.replace(';; zk verification code goes here', insert_code)


  // store func_template to a file
  fs.writeFileSync(path.join(__dirname, "../contracts/tonnel.fc"), func_template)
  process.exit(0)
})

// assert(await groth16.verify(vkey, publicSignals, proof))
