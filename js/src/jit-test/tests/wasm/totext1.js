if (!wasmIsSupported())
     quit();

// FIXME: Enable this test once binary-to-text is implemented again.
quit();

load(libdir + "asserts.js");

var caught = false;
try {
    wasmBinaryToText(new Int8Array(1));
} catch (e) {
    caught = true;
}
assertEq(caught, true);

function runTest(code) {
  var expected = wasmTextToBinary(code);
  var s = wasmBinaryToText(expected);
  print("TEXT: " + s);
  var roundtrip = wasmTextToBinary(s);
  assertDeepEq(expected, roundtrip);
}

// Smoke test
runTest(`
(module
  (func (param i32) (result f64)
     (local $l f32)
     (block
        (set_local $l (f32.const 0.0))
        (loop $exit $cont
           (br_if $exit (get_local 0))
           (br 2)
        )
        (if (i32.const 1)
           (f64.min (f64.neg (f64.const 1)) (f64.const 0))
           (f64.add (f64.const 0.5) (f64.load offset=0 (i32.const 0)) )
        )
     )
     (i32.store16 (i32.const 8) (i32.const 128))

     (return (f64.const 0))
  )
  (export "test" 0)
  (memory 1 10)
)`);

// Constants, stores and loads
runTest(`
(module (func
  (local i32) (local f32) (local f64)
  (i32.const 0)
  (i32.const 100002)
  (f32.const 0.0)
  (f32.const 1.5)
  (f64.const 0.0)
  (f64.const -10.25)
  (i32.store (i32.const 0) (i32.load (i32.const 0)))
  (i32.store8 (i32.const 1) (i32.load8_s (i32.const 2)))
  (i32.store8 (i32.const 3) (i32.load8_u (i32.const 4)))
  (i32.store16 (i32.const 2) (i32.load16_s (i32.const 0)))
  (i32.store16 (i32.const 1) (i32.load16_u (i32.const 0)))
  (f32.store (i32.const 5) (f32.load (i32.const 6)))
  (f64.store (i32.const 5) (f64.load (i32.const 6)))
  (set_local 0 (get_local 0))
  (set_local 2 (get_local 2))
)(memory 100))`);

// Branching
runTest(`
(module
(func
  (block (block (block (nop))))
  (block (loop))
  (if (i32.const 0) (block $label (nop)))
  (if (i32.const 1) (nop) (loop $exit $cont (block)))
  (block $l (br $l))
  (block $m (block (block (br $m))))
  (block $k (br_if 0 (i32.const 0)) (return))
  (block $n (block (block (br_if 2 (i32.const 1)) (nop))))
  (block $1 (block $2 (block $3 (br_table $2 $3 $1 (nop) (i32.const 1)) )) (nop))
  (loop $exit $cont (br_if $cont (i32.const 0)) (nop))
  (return)
)
(func (result f32) (return (f32.const -0.5)))
(memory 0)
)`);

// i32, f32 and f64 operations
runTest(`
(module
  (func $iadd (param $x i32) (param $y i32) (result i32) (i32.add (get_local $x) (get_local $y)))
  (func $isub (param $x i32) (param $y i32) (result i32) (i32.sub (get_local $x) (get_local $y)))
  (func $imul (param $x i32) (param $y i32) (result i32) (i32.mul (get_local $x) (get_local $y)))
  (func $idiv_s (param $x i32) (param $y i32) (result i32) (i32.div_s (get_local $x) (get_local $y)))
  (func $idiv_u (param $x i32) (param $y i32) (result i32) (i32.div_u (get_local $x) (get_local $y)))
  (func $irem_s (param $x i32) (param $y i32) (result i32) (i32.rem_s (get_local $x) (get_local $y)))
  (func $irem_u (param $x i32) (param $y i32) (result i32) (i32.rem_u (get_local $x) (get_local $y)))
  (func $iand (param $x i32) (param $y i32) (result i32) (i32.and (get_local $x) (get_local $y)))
  (func $ior (param $x i32) (param $y i32) (result i32) (i32.or (get_local $x) (get_local $y)))
  (func $ixor (param $x i32) (param $y i32) (result i32) (i32.xor (get_local $x) (get_local $y)))
  (func $ishl (param $x i32) (param $y i32) (result i32) (i32.shl (get_local $x) (get_local $y)))
  (func $ishr_s (param $x i32) (param $y i32) (result i32) (i32.shr_s (get_local $x) (get_local $y)))
  (func $ishr_u (param $x i32) (param $y i32) (result i32) (i32.shr_u (get_local $x) (get_local $y)))
  (func $iclz (param $x i32) (result i32) (i32.clz (get_local $x)))
  (func $ictz (param $x i32) (result i32) (i32.ctz (get_local $x)))
  (func $ipopcnt (param $x i32) (result i32) (i32.popcnt (get_local $x)))
  (func $ieq (param $x i32) (param $y i32) (result i32) (i32.eq (get_local $x) (get_local $y)))
  (func $ine (param $x i32) (param $y i32) (result i32) (i32.ne (get_local $x) (get_local $y)))
  (func $ilt_s (param $x i32) (param $y i32) (result i32) (i32.lt_s (get_local $x) (get_local $y)))
  (func $ilt_u (param $x i32) (param $y i32) (result i32) (i32.lt_u (get_local $x) (get_local $y)))
  (func $ile_s (param $x i32) (param $y i32) (result i32) (i32.le_s (get_local $x) (get_local $y)))
  (func $ile_u (param $x i32) (param $y i32) (result i32) (i32.le_u (get_local $x) (get_local $y)))
  (func $igt_s (param $x i32) (param $y i32) (result i32) (i32.gt_s (get_local $x) (get_local $y)))
  (func $igt_u (param $x i32) (param $y i32) (result i32) (i32.gt_u (get_local $x) (get_local $y)))
  (func $ige_s (param $x i32) (param $y i32) (result i32) (i32.ge_s (get_local $x) (get_local $y)))
  (func $ige_u (param $x i32) (param $y i32) (result i32) (i32.ge_u (get_local $x) (get_local $y)))

  (func $fadd (param $x f32) (param $y f32) (result f32) (f32.add (get_local $x) (get_local $y)))
  (func $fsub (param $x f32) (param $y f32) (result f32) (f32.sub (get_local $x) (get_local $y)))
  (func $fmul (param $x f32) (param $y f32) (result f32) (f32.mul (get_local $x) (get_local $y)))
  (func $fdiv (param $x f32) (param $y f32) (result f32) (f32.div (get_local $x) (get_local $y)))
  (func $fsqrt (param $x f32) (result f32) (f32.sqrt (get_local $x)))
  (func $fmin (param $x f32) (param $y f32) (result f32) (f32.min (get_local $x) (get_local $y)))
  (func $fmax (param $x f32) (param $y f32) (result f32) (f32.max (get_local $x) (get_local $y)))
  (func $fceil (param $x f32) (result f32) (f32.ceil (get_local $x)))
  (func $ffloor (param $x f32) (result f32) (f32.floor (get_local $x)))
  (func $fabs (param $x f32) (result f32) (f32.abs (get_local $x)))
  (func $fneg (param $x f32) (result f32) (f32.neg (get_local $x)))

  (func $dadd (param $x f64) (param $y f64) (result f64) (f64.add (get_local $x) (get_local $y)))
  (func $dsub (param $x f64) (param $y f64) (result f64) (f64.sub (get_local $x) (get_local $y)))
  (func $dmul (param $x f64) (param $y f64) (result f64) (f64.mul (get_local $x) (get_local $y)))
  (func $ddiv (param $x f64) (param $y f64) (result f64) (f64.div (get_local $x) (get_local $y)))
  (func $dceil (param $x f64) (result f64) (f64.ceil (get_local $x)))
  (func $dfloor (param $x f64) (result f64) (f64.floor (get_local $x)))
  (func $dabs (param $x f64) (result f64) (f64.abs (get_local $x)))
  (func $dneg (param $x f64) (result f64) (f64.neg (get_local $x)))
(memory 0))`);

// conversions
runTest(`
(module
  (func $itrunc_s_f32 (param $x f32) (result i32) (i32.trunc_s/f32 (get_local $x)))
  (func $itrunc_u_f32 (param $x f32) (result i32) (i32.trunc_u/f32 (get_local $x)))
  (func $itrunc_s_f64 (param $x f64) (result i32) (i32.trunc_s/f64 (get_local $x)))
  (func $itrunc_u_f64 (param $x f64) (result i32) (i32.trunc_u/f64 (get_local $x)))
  (func $fconvert_s_i32 (param $x i32) (result f32) (f32.convert_s/i32 (get_local $x)))
  (func $dconvert_s_i32 (param $x i32) (result f64) (f64.convert_s/i32 (get_local $x)))
  (func $fconvert_u_i32 (param $x i32) (result f32) (f32.convert_u/i32 (get_local $x)))
  (func $dconvert_u_i32 (param $x i32) (result f64) (f64.convert_u/i32 (get_local $x)))
  (func $dpromote_f32 (param $x f32) (result f64) (f64.promote/f32 (get_local $x)))
  (func $fdemote_f64 (param $x f64) (result f32) (f32.demote/f64 (get_local $x)))
(memory 0))`);
