class Acumulador {
  var total: integer = 0;
  function constructor(inicial: integer) {
    this.total = inicial;
  }
  function agregar(valor: integer): integer {
    this.total = this.total + valor;
    return this.total;
  }
}
function duplicar(valor: integer): integer {
  return valor * 2;
}
let datos: integer[] = [1, 2, 3];
let acumulador: Acumulador = new Acumulador(0);
foreach (dato in datos) {
  print(acumulador.agregar(duplicar(dato)));
}
