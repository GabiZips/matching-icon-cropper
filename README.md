# Matching Icon Cropper

Aplicativo desktop para Windows que cria dois matching icons a partir de uma imagem.

## Recursos

- Dois recortes quadrados independentes
- Nomes personalizados para cada ícone
- Movimento e redimensionamento por arraste ou controles
- Exportação em PNG
- Preservação da animação de GIFs
- Processamento local, sem enviar imagens para a internet

## Executável portátil

Baixe `Matching Icon Cropper-0.1.0-portable.exe` na seção **Releases** do repositório. O aplicativo não precisa ser instalado.

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
