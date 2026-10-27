class Contador {
  var valor: integer = 0;
  function constructor(inicial: integer) {
    this.valor = inicial;
  }
  function incrementar(): integer {
    this.valor = this.valor + 1;
    return this.valor;
  }
}
let contador: Contador = new Contador(5);
print(contador.incrementar());
