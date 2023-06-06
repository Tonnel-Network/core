function number_to_func_cell_g1(nums, name) {
  let num = nums[0]
  let y = BigInt(nums[1])
  y *= 2n;
  y /= 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
  // padding to 381 bits
  let flag = y.toString(2)

  // console.log(flag)
  // console.log(flag)
  // console.log(y.toString(2))

  let code = `slice ${name} =  begin_cell()`

  num = BigInt(num)
  // console.log(num.toString(10))
  const bin  = num.toString(2)
// padding to 384 bits
  const padding =  "10" + flag + bin.padStart(381, '0')
// print each 48 bits
  for (let i = 0; i < padding.length; i += 48) {
    const chunk = padding.slice(i, i + 48)
    // convert chunk to decimal
    // console.log(chunk)
    const dec = BigInt('0b' + chunk)
    // console.log(dec)
    code += `.store_uint(${dec.toString(10)}, 48)`
  }
  code += `.end_cell().begin_parse();`

  return code
}
module.exports.g1Parser = number_to_func_cell_g1


