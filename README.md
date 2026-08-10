# Matching Icon Cropper

Aplicativo desktop para Windows que cria dois matching icons a partir de uma imagem.

## Recursos

- Dois recortes quadrados independentes
- Nomes personalizados para cada ícone
- Cor personalizada para o nome e o quadrado de cada ícone
- Movimento e redimensionamento por arraste ou controles
- Exportação em PNG
- Preservação da animação de GIFs
- Processamento local, sem enviar imagens para a internet

## Executável portátil

Baixe o arquivo `Matching Icon Cropper-*-portable.exe` na seção **Releases** do repositório. O aplicativo não precisa ser instalado.

## Desenvolvimento

Requer Node.js 22.13 ou mais recente.

```bash
npm install
npm run dev
```

Para gerar o executável:

```bash
npm run package
```

O arquivo será criado na pasta `release`.
