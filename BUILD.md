# Build Instructions

このドキュメントでは、Coding Rule Checker拡張機能のビルド方法について説明します。

## 必要な環境

- Node.js 20.x以上
- npm 9.x以上
- Windows環境（バッチファイル使用時）

## バッチファイル一覧

プロジェクトルートに以下のバッチファイルが用意されています。

### 1. build-vsix.bat

VSIXファイルをビルドします。これは拡張機能のインストール可能なパッケージファイルです。

```batch
build-vsix.bat
```

**実行内容:**
1. 依存関係のインストール（初回のみ）
2. TypeScriptのコンパイル
3. VSIXファイルのパッケージング

**生成されるファイル:**
- `extension/coding-rule-checker-0.1.0.vsix`

### 2. clean-build.bat

クリーンビルドを実行します。すべてをクリーンアップして最初からビルドします。

```batch
clean-build.bat
```

**実行内容:**
1. `dist/` ディレクトリの削除
2. `node_modules/` ディレクトリの削除
3. 依存関係の再インストール
4. TypeScriptのコンパイル

**使用場面:**
- ビルドエラーが発生した場合
- 依存関係の問題を解決したい場合
- 完全にクリーンな状態からビルドしたい場合

### 3. dev-watch.bat

開発用のウォッチモードを起動します。ファイル変更時に自動的に再コンパイルされます。

```batch
dev-watch.bat
```

**実行内容:**
- TypeScriptのウォッチモードを起動
- ファイル保存時に自動コンパイル

**使用場面:**
- コードを開発中
- リアルタイムでコンパイル結果を確認したい場合

**停止方法:**
- `Ctrl+C` を押す

### 4. run-lint.bat

ESLintによるコード品質チェックを実行します。

```batch
run-lint.bat
```

**実行内容:**
- ESLintによるコード解析
- コーディングスタイルと潜在的な問題のチェック

**使用場面:**
- コードをコミットする前
- コード品質を確認したい場合

## 手動ビルド（npm経由）

バッチファイルを使用しない場合は、以下のnpmコマンドを使用できます。

### 依存関係のインストール

```bash
cd extension
npm install
```

### TypeScriptのコンパイル

```bash
npm run compile
```

### ウォッチモード

```bash
npm run watch
```

### ESLint実行

```bash
npm run lint
```

### VSIXパッケージング

```bash
npm run package
```

## VSIXファイルのインストール

1. VSCodeを開く
2. 拡張機能ビュー（`Ctrl+Shift+X`）を開く
3. 右上の「...」メニューをクリック
4. 「Install from VSIX...」を選択
5. 生成された `.vsix` ファイルを選択

または、コマンドラインから：

```bash
code --install-extension extension/coding-rule-checker-0.1.0.vsix
```

## 開発モードでの実行

VSIXファイルをインストールせずに、開発モードで拡張機能をテストできます。

1. VSCodeでプロジェクトを開く
2. `F5` キーを押す
3. Extension Development Hostウィンドウが開く
4. この新しいウィンドウで拡張機能が有効になっている

## トラブルシューティング

### コンパイルエラーが発生する

```batch
clean-build.bat
```

を実行してクリーンビルドを試してください。

### 依存関係のエラー

```bash
cd extension
rm -rf node_modules package-lock.json
npm install
```

依存関係を完全に再インストールしてください。

### VSIXパッケージングが失敗する

`@vscode/vsce` がインストールされているか確認してください：

```bash
cd extension
npm install --save-dev @vscode/vsce
```

### 拡張機能が動作しない

1. VSCodeを再起動
2. Copilotが有効になっているか確認
3. 設定ファイル（`.vscode/coding-rule-checker/settings.json`）が正しく配置されているか確認

## ビルド成果物

ビルドが成功すると、以下のファイルが生成されます：

```
extension/
├── dist/                          # コンパイル済みJavaScript
│   ├── extension.js
│   ├── extension.js.map
│   ├── config.js
│   ├── codeRetriever.js
│   ├── reviewEngine.js
│   ├── parallelReviewer.js
│   ├── ruleParser.js
│   ├── outputFormatter.js
│   └── types.js
└── coding-rule-checker-0.1.0.vsix # インストール可能なパッケージ
```

## 継続的インテグレーション

CI/CD環境でビルドする場合：

```bash
cd extension
npm ci                # 依存関係のクリーンインストール
npm run compile       # コンパイル
npm run lint          # リント
npm run package       # パッケージング
```

## 参考リンク

- [VSCode Extension API](https://code.visualstudio.com/api)
- [vsce (Visual Studio Code Extension Manager)](https://github.com/microsoft/vscode-vsce)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
