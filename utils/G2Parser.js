function number_to_func_cell_g2(num0, num1, ys, name) {
  let code = `slice ${name} =  begin_cell()`
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
    code += `.store_uint(${dec.toString(10)}, 96)`
  }
  bin  = num0.toString(2)
// padding to 384 bits
  padding =  "000" + bin.padStart(381, '0')
  for (let i = 0; i < padding.length; i += 96) {
    const chunk = padding.slice(i, i + 96)
    // convert chunk to decimal
    // console.log(chunk)
    const dec = BigInt('0b' + chunk)
    // console.log(dec)
    code += `.store_uint(${dec.toString(10)}, 96)`
  }


  code += `.end_cell().begin_parse();`
  return code;

}
module.exports.g2Parser = number_to_func_cell_g2