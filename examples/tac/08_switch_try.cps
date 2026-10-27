let opcion: integer = 2;
switch (opcion) {
  case 1:
    print("uno");
    break;
  case 2:
    print("dos");
    break;
  default:
    print("otro");
}
try {
  print(opcion);
} catch (error) {
  print(error);
}
