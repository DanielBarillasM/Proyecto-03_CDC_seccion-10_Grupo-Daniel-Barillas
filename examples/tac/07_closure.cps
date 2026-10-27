function crearContador(inicial: integer) {
  let actual: integer = inicial;
  function siguiente(): integer {
    actual = actual + 1;
    return actual;
  }
  return siguiente;
}
let contador = crearContador(0);
print(contador());
