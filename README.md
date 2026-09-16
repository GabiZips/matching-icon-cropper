# Matching Icon Cropper

Aplicativo desktop para Windows que cria dois matching icons a partir de uma imagem.

## Recursos

- Duas áreas de recorte independentes
- Nomes personalizados para cada ícone
- Cor personalizada para o nome e a área de cada ícone
- Imagem carregada pelo seletor ou arrastando o arquivo para o app
- Proporção travada em `1:1`, `3:4`, `4:3`, `9:16` ou `16:9`
- Modo livre para controlar largura e altura separadamente
- Preview em tempo real dos dois recortes lado a lado
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
