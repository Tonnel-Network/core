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

func_template = func_template.replace(';; zk verification code goes here', insert_code)


// store func_template to a file
fs.writeFileSync(path.join(__dirname, "../contracts/tonnel.fc"), func_template)

// assert(await groth16.verify(vkey, publicSignals, proof))