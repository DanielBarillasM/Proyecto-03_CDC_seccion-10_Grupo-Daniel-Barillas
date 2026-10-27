// Esperado en MARS: 120
function factorial(n: integer): integer {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}
print(factorial(5));
