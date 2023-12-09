#!/bin/bash

# This file should be store in ./scripts of the project folder
# This script will build following files in the ./build/circuits
#
# circuit.r1cs
# circuit.sym
# circuit.wasm
# powersOfTau28_hez_final_11.ptau
# circuit_0000.zkey
# circuit_final.zkey
# verification_key.json

# constants
TARGET_CIRCUIT=../../circuits/withdraw.circom
PTAU_FILE=pot14_final.ptau
ENTROPY_FOR_ZKEY=mnbvc

cd "$(dirname "$0")"

# to project root
cd ..

# load .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# build directory ../build/circuits
mkdir -p ./build/circuits

cd ./build/circuits

# generate circuit.r1cs & circuit.sym & circuit.wasm

echo 'Generating circuit.r1cs & circuit.sym & circuit.wasm'
circom $TARGET_CIRCUIT --r1cs circuit.r1cs --wasm circuit.wasm --prime bls12381 --sym circuit.sym

# you can either download $PTAU_FILE or generate it by yourself

##### Genereate:
#snarkjs powersoftau new bls12-381 17 pot14_0000.ptau -v
#snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau --name="First contribution" -v
#snarkjs powersoftau contribute pot14_0001.ptau pot14_0002.ptau --name="Second contribution" -v -e="some random text"
#echo 'beacon'
#snarkjs powersoftau beacon pot14_0002.ptau pot14_beacon.ptau 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="Final Beacon"
#echo 'prepare phase2'
#
#snarkjs powersoftau prepare phase2 pot14_beacon.ptau pot14_final.ptau -v
#
#
#snarkjs powersoftau verify pot14_final.ptau

#######
# download:
#if [ -f ./$PTAU_FILE ]; then
#    echo skip: "$PTAU_FILE already exists"
#else
#    echo "Downloading $PTAU_FILE"
#    wget https://histopia.io/pot14_final.ptau
#fi

# generate circuit_0000.zkey
echo "Generating circuit_0000.zkey"
snarkjs zkey new circuit.r1cs $PTAU_FILE circuit_0000.zkey

# generate circuit_final.zkey
echo "Generating circuit_final.zkey"
echo $ENTROPY_FOR_ZKEY | snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey

# generate verification_key.json
echo "Generating verification_key.json"
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json