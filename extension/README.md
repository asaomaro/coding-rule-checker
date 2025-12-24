# コーディングルールチェッカー (VSCode拡張機能)

**[重要] 本拡張機能は現在アルファ版です。予期せぬ不具合や動作の不安定さがある可能性があります。**

Markdown形式で記述されたコーディングルールに基づき、静的コード解析を実行するVSCode拡張機能です。

## 概要

コーディングルールチェッカーは、カスタムのコーディングルールをMarkdown形式で定義し、AIを使用してこれらのルールに対してコードを自動的にレビューすることができます。
VSCodeのLanguage Model APIを活用し、Copilot Chatからコードレビューを簡単かつ効率的に行えます。

## 主な機能

- **カスタムルールによるレビュー**: Markdownで記述されたコーディングルールに対してコードをレビュー
- **GitHub Copilot Chat連携**: VSCodeのCopilot Chatとシームレスに統合
- **マルチソース対応**: ローカルファイル、Git差分、GitHubリポジトリをサポート
- **複数ファイル・フォルダ対応**: 複数のターゲットを一度のコマンドでレビュー
- **複数ルールセット対応**: ファイルパターンに応じて異なるルールセットを適用
- **高速並列処理**: ファイル、ルールセット、章、イテレーションを並列実行
- **偽陽性フィルタリング**:
    - 設定可能なしきい値による偽陽性除外
    - 複数回のレビューで一貫して検出される指摘のみを採用
    - 偽陽性チェックによる誤検知の削減
- **柔軟な出力形式**:
    - 通常形式（階層構造）と表形式をサポート
    - カスタマイズ可能なMarkdownテンプレート
- **章別フィルタリング**: ファイルパターンに応じて特定の章のみをレビュー
- **レビュー結果の保存**: 結果をMarkdownファイルとして保存

## 要件

- VSCode 1.85.0 以上
- GitHub Copilot サブスクリプション
- `gh` CLI (GitHub連携機能を使用する場合)

## インストール

### VSIXファイルから

1. `.vsix`ファイルを[リリースページ](https://github.com/asaomaro/coding-rule-checker/releases)からダウンロード、または[開発ガイド](../../README.md)に従ってビルドします
2. VSCodeを開きます
3. 拡張機能ビューに移動します (`Ctrl+Shift+X`)
4. 「...」メニューをクリックし、「VSIXからのインストール...」を選択します
5. ダウンロードした`.vsix`ファイルを選択します

## 初期セットアップ

拡張機能を利用可能にするまでの手順を説明します。

### ステップ1: 必須ファイルのダウンロード

以下の5つのマークダウンファイルを必ずダウンロードし、`.vscode/coding-rule-checker/`ディレクトリに配置してください。

**必須ファイル:**
1. `review-results-template.md` - レビュー結果の出力テンプレート
2. `system-prompt.md` - システムプロンプト
3. `review-prompt.md` - レビュー実行時のプロンプト
4. `false-positive-prompt.md` - 偽陽性チェック用プロンプト
5. `summary-prompt.md` - サマリー生成用プロンプト

**ダウンロード方法:**
1. [リリースページ](https://github.com/asaomaro/coding-rule-checker/releases)にアクセス
2. 最新リリースから上記のファイルをダウンロード
3. プロジェクトルートに `.vscode/coding-rule-checker/` ディレクトリを作成
4. ダウンロードしたファイルを配置

### ステップ2: settings.json の作成

`.vscode/coding-rule-checker/settings.json` を作成し、基本設定を記述します。

**最小構成の例（単一ルールセット）:**
```json
{
  "model": "gpt-4-turbo",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "templatesPath": ".vscode/coding-rule-checker/review-results-template.md",
  "ruleset": "my-rules"
}
```

**複数ルールセットの例:**
```json
{
  "model": "gpt-4-turbo",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "templatesPath": ".vscode/coding-rule-checker/review-results-template.md",
  "ruleset": {
    "java-rules": ["*.java"],
    "typescript-rules": ["*.ts", "*.tsx"]
  }
}
```

### ステップ3: ルールセットフォルダの作成

`settings.json` で指定したルールセット名に対応するフォルダを作成します。

**単一ルールセットの場合:**
```
.vscode/coding-rule-checker/
└── my-rules/          # settings.jsonのruleset名と一致
```

**複数ルールセットの場合:**
```
.vscode/coding-rule-checker/
├── java-rules/        # settings.jsonのruleset名と一致
└── typescript-rules/  # settings.jsonのruleset名と一致
```

### ステップ4: rule-settings.json の作成

各ルールセットフォルダ内に `rule-settings.json` を作成します。

**例: `.vscode/coding-rule-checker/my-rules/rule-settings.json`**
```json
{
  "rulesPath": ".vscode/coding-rule-checker/my-rules/rules",
  "reviewIterations": {
    "default": 2
  },
  "falsePositiveCheckIterations": {
    "default": 2
  }
}
```

**設定項目の説明:**
- `rulesPath`: ルールファイルが格納されるディレクトリパス（必須）
- `reviewIterations`: レビューの反復回数（推奨: 2-3回）
- `falsePositiveCheckIterations`: 偽陽性チェックの反復回数（推奨: 2回）
- `commonPromptPath`: 全レビューで共通のプロンプト（オプション）
- `chapterFilePatterns`: 特定の章を特定のファイルパターンにのみ適用（オプション）

### ステップ5: rulesフォルダとルールファイルの作成

各ルールセットフォルダ内に `rules` フォルダを作成し、章単位で分割したルールMarkdownファイルを配置します。

**ディレクトリ構造:**
```
.vscode/coding-rule-checker/
└── my-rules/
    ├── rule-settings.json
    └── rules/
        ├── 01_naming-conventions.md    # 第1章: 命名規則
        ├── 02_code-structure.md        # 第2章: コード構造
        └── 03_error-handling.md        # 第3章: エラー処理
```

**ルールファイルの記述例 (`01_naming-conventions.md`):**
```markdown
## 1. 命名規則

### 1.1 変数名
変数名は意味が明確で、camelCaseを使用すること。

#### 1.1.1 ローカル変数
ローカル変数は小文字で始めること。

### 1.2 関数名
関数名は動詞で始め、何をするかが明確であること。

## 2. コメント規則

### 2.1 関数コメント
すべての公開関数には JSDoc コメントを記述すること。
```

**ルールファイルの記述ルール:**
- `##` (H2): 章の区切り（各章は独立してレビューされます）
- `###` (H3): 個別のルール
- `####` (H4): サブルール（詳細なガイドライン）
- ファイル名は `01_xxxx.md` の形式（数字は章番号と一致させることを推奨）

### ステップ6: 完成後のディレクトリ構造

すべてのセットアップが完了すると、以下のような構造になります。

**単一ルールセットの場合:**
```
.vscode/coding-rule-checker/
├── my-rules/
│   ├── rule-settings.json
│   └── rules/
│       ├── 01_naming-conventions.md
│       ├── 02_code-structure.md
│       └── 03_error-handling.md
├── review-results-template.md
├── system-prompt.md
├── review-prompt.md
├── false-positive-prompt.md
├── summary-prompt.md
└── settings.json
```

**複数ルールセットの場合:**
```
.vscode/coding-rule-checker/
├── java-rules/
│   ├── rule-settings.json
│   └── rules/
│       ├── 01_class-structure.md
│       └── 02_naming.md
├── typescript-rules/
│   ├── rule-settings.json
│   └── rules/
│       ├── 01_types.md
│       └── 02_async.md
├── review-results-template.md
├── system-prompt.md
├── review-prompt.md
├── false-positive-prompt.md
├── summary-prompt.md
└── settings.json
```

### ステップ7: 動作確認

1. VSCodeでプロジェクトを開く
2. GitHub Copilot Chatを開く
3. 以下のコマンドでテストレビューを実行:
   ```
   @coding-rule-checker /review #file
   ```
4. レビュー結果が表示されれば、セットアップ完了です

**トラブルシューティング:**
- エラーが発生する場合は、`settings.json` のパスが正しいか確認してください
- ルールセット名が `settings.json` とフォルダ名で一致しているか確認してください
- すべての必須ファイル（5つのマークダウン）が配置されているか確認してください

## コマンドリファレンス

### `/review` - コードのレビュー

コーディングルールに対してファイル全体またはフォルダ全体をレビューします。

**構文:**
```
/review [--ruleset=<rulesets>] <target>...
/review [-r <rulesets>] <target>...
```

**ターゲット:**
- `#file` - VSCodeファイル参照（UIで選択）
- `#file:filename` - ファイル名パターンによるファイル
- `#folder` - VSCodeフォルダ参照（UIで選択）
- `#folder:foldername` - フォルダ名パターンによるフォルダ
- `https://github.com/...` - GitHubファイルURL
- `./path/to/file.ts` - 明示的なパス（拡張子付き）

**オプション:**
- `--ruleset=name` or `-r name` - ルールセットを上書き（複数指定の場合はカンマ区切り）

### `/diff` - Diffのレビュー

git diffの変更されたコードのみをレビューします。

**構文:**
```
/diff [range] [#file]
```

**範囲の例:**
- `/diff` - コミットされていない変更をレビュー
- `/diff main..feature` - ブランチ間のdiffをレビュー
- `/diff v1.0.0..v2.0.0` - タグ間のdiffをレビュー
- `/diff https://github.com/owner/repo/compare/main...feature` - GitHub上のdiffをレビュー

## 使用例

### 基本的なファイルレビュー

```bash
# VSCodeファイル参照を使用したレビュー
@coding-rule-checker /review #file

# ファイル名パターンによるレビュー
@coding-rule-checker /review #file:UserService.java

# 複数ファイルを名前でレビュー
@coding-rule-checker /review #file:UserService.java #file:OrderController.java
```

### フォルダレビュー

```bash
# フォルダ全体を再帰的にレビュー
@coding-rule-checker /review #folder

# フォルダを名前でレビュー
@coding-rule-checker /review #folder:src/components
```

### ルールセットの上書き

```bash
# 特定のルールセットを使用（自動検出を上書き）
@coding-rule-checker /review --ruleset=typescript-rules #file

# 複数のルールセットを使用
@coding-rule-checker /review -r typescript-rules,security-rules #file
```

### Git Diff レビュー

```bash
# ブランチ間のdiffをレビュー
@coding-rule-checker /diff main..feature

# 特定のファイルのdiffをレビュー
@coding-rule-checker /diff main..feature #file

# コミットされていない変更をレビュー
@coding-rule-checker /diff
```

### GitHub連携

```bash
# 単一のGitHubファイルをレビュー
@coding-rule-checker /review https://github.com/owner/repo/blob/main/src/app.ts

# GitHubのdiffをレビュー
@coding-rule-checker /diff https://github.com/owner/repo/compare/main...feature
```

## 設定

この拡張機能は、ワークスペースの`.vscode/coding-rule-checker`ディレクトリにある設定ファイル群によって制御されます。

### 1. `settings.json`

メインの設定ファイルです。

**パターン1: 単一ルールセット（シンプルモード）**
```json
{
  "model": "gpt-4-turbo",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "ruleset": "typescript-rules"
}
```

**パターン2: 複数ルールセット（アドバンスモード）**
```json
{
  "model": "gpt-4-turbo",
  "ruleset": {
    "common": ["*.java", "*.html"],
    "app-rule": ["common/*.java", "component*.java"],
    "web-rule": ["*.html", "*.css"]
  }
}
```

#### 設定項目の説明

- `model` 使用するLLMモデル（例: "copilot-gpt-4", "gpt-5-mini"）。有料モデルを利用する場合、レビューの反復回数や並列実行数によっては、大量のプレミアムリクエストを消費する可能性があるためご注意ください。未指定の場合は選択中のモデルが使用されます。
- `systemPromptPath` (必須): システムプロンプトファイルのパス
- `summaryPromptPath` (必須): サマリープロンプトファイルのパス
- `templatesPath` (必須): レビュー結果テンプレートファイルのパス
- `ruleset` (必須): ルールセット設定
    - **シンプルモード（文字列）**: 単一のルールセット名
    - **アドバンスモード（オブジェクト）**: ルールセット名とファイルパターンのマッピング
- `fileOutput`: ファイル出力設定（常に有効）
- `maxConcurrentReviews` (オプション, デフォルト: 10): 最大並列実行数
- `maxRetries` (オプション, デフォルト: 3): Rate limitエラー時の最大リトライ回数
- `showRulesWithNoIssues` (オプション, デフォルト: false): 指摘がないルールも表示するか
- `outputFormat` (オプション, デフォルト: `"normal"`): レビュー結果の出力形式。
    - `"normal"`: 章とルールごとに階層的に結果を出力します。
        ```markdown
        ## Review Results: java-rule

        ### 2. ファイル構成・パッケージ宣言・import の扱い

        #### 2.3 import の扱い

        - NG1 : 7 (検出回数: 2/3 (66.7%))
            - NGコードスニペット:
                ``` text
                import java.math.BigDecimal;
                import java.util.ArrayList;
                import java.util.List;
                import rpgtospa.common.validation.bldto.ErrorDataBlDto;
                import lombok.Data;
                import lombok.EqualsAndHashCode;
                ```
            - NG理由:
                import の並び順規約（java.* → javax.* → 外部ライブラリ → 自作パッケージ）に違反しています。自作パッケージの import (rpgtospa...) が外部ライブラリの lombok import より前に配置されています。
            - 修正案:
                外部ライブラリ（lombok）の import を自作パッケージの import より前に移動して、規約に従った順序に並べてください。
            - 修正例:
                ``` text
                import java.math.BigDecimal;
                import java.util.ArrayList;
                import java.util.List;
                import lombok.Data;
                import lombok.EqualsAndHashCode;
                import rpgtospa.common.validation.bldto.ErrorDataBlDto;
                ```
        ```
    - `"table"`: 結果を表形式で出力します。各章のルール指摘が表としてまとめられます。
        ```markdown
        ## Review Results: java-rule

        ### 2. ファイル構成・パッケージ宣言・import の扱い

        | 項番 | 項番タイトル | 行番号 | NGコード | NG理由 | 修正案 | 修正例 | 検出回数 |
        |:---|:---|:---|:---|:---|:---|:---|:---|
        | 2.3 | import の扱い | 7 | import java.math.BigDecimal;<br>import java.util.ArrayList;<br>import java.util.List;<br><br>import rpgtospa.common.validation.bldto.ErrorDataBlDto;<br>import lombok.Data;<br>import lombok.EqualsAndHashCode; | インポートの並び順規約（java.* → javax.* → 外部ライブラリ → 自作パッケージ）に違反しています。自作パッケージの import (rpgtospa.common.validation.bldto.ErrorDataBlDto) が外部ライブラリの lombok より前に配置されています（行7 が問題の開始位置）。 | 外部ライブラリ（lombok）を自作パッケージより前に並べ替えてください。グルーピングごとに空行を入れると可読性が向上します。 | package rpgtospa.common.exception;<br><br>import java.math.BigDecimal;<br>import java.util.ArrayList;<br>import java.util.List;<br><br>import lombok.Data;<br>import lombok.EqualsAndHashCode;<br><br>import rpgtospa.common.validation.bldto.ErrorDataBlDto; | 2/3 (66.7%) |
        ```
- `issueDetectionThreshold` (オプション, デフォルト: 0.5): 偽陽性判定のしきい値 (0.0 - 1.0)

### 2. `rule-settings.json`

各ルールセット固有の設定ファイルです。

```json
{
  "rulesPath": ".vscode/coding-rule-checker/sample-rule/rules",
  "reviewIterations": { "default": 2 },
  "falsePositiveCheckIterations": { "default": 2 },
  "chapterFilePatterns": {
    "1": ["*.component.ts", "*.service.ts"],
    "3": ["*.test.ts"]
  }
}
```

- `rulesPath` (必須): ルールファイル（Markdown）が格納されたディレクトリ
- `reviewPromptPath` (オプション): レビュー実行時に使用するプロンプトファイルのパス
- `falsePositivePromptPath` (オプション): 偽陽性チェック時に使用するプロンプトファイルのパス
- `commonPromptPath` (オプション): 全てのレビューで共通して使用される追加プロンプトファイルのパス（例：総則など）。ここに指定したファイルは、`rulesPath`ディレクトリ内に存在していても、レビュー対象からは除外されます。
- `reviewIterations`: レビューの反復回数
- `falsePositiveCheckIterations`: 偽陽性チェックの反復回数
- `chapterFilePatterns` (オプション): 章ごとにレビュー対象ファイルを限定

### 3. レビュー結果テンプレート

レビュー結果の出力形式は、`templatesPath`に指定したテンプレートファイルでカスタマイズできます。テンプレートでは以下の変数が利用可能です。

#### ファイルレベル変数
- `{fileName}` - ファイル名（クリック可能なリンク）
- `{filePath}` - ファイルの完全パス
- `{diffDetails}` - Diff範囲の詳細（例: "main..feature"）
- `{totalIssues}` - 全ルールセットの合計問題数

#### ルールセットレベル変数
- `{rulesetName}` - ルールセット名
- `{issueCount}` - このルールセットの問題数
- `{reviewedChapters}` - レビューした章のタイトル（カンマ区切り）

#### チャプターレベル変数
- `{chapterId}` - 章ID（例: "1", "2"）
- `{chapterTitle}` - 章タイトル
- `{reviewIterations}` - この章のレビュー回数
- `{ngCount}` - この章で検出された問題数
- `{ngRate}` - NG率（ngCount / reviewIterations）

#### ルールレベル変数
- `{ruleHeader}` - Markdownヘッダーレベル（例: "###", "####"）
- `{ruleId}` - ルールID（例: "1.1", "2.3"）
- `{ruleTitle}` - ルールタイトル

#### 問題レベル変数
- `{issueNumber}` - ルール内の問題番号（1, 2, 3, ...）
- `{lineNumber}` - 問題が見つかった行番号
- `{language}` - シンタックスハイライト用のプログラミング言語
- `{codeSnippet}` - 問題のあるコードスニペット
- `{reason}` - 問題の説明
- `{suggestion}` - 修正案
- `{fixedCodeSnippet}` - 修正後のコード例
- `{detectionCount}` - この問題が検出された回数
- `{detectionRate}` - 検出率（%）（detectionCount / reviewIterations × 100）

#### テンプレート例

```markdown
### {chapterId}. {chapterTitle}

#### {ruleId} {ruleTitle}
- NG{issueNumber} : {lineNumber} (検出回数: {detectionCount}/{reviewIterations} ({detectionRate}%))
    - NG理由: {reason}
    - 修正案: {suggestion}
```

詳細は `.vscode/coding-rule-checker/review-results-template.md` のサンプルを参照してください。

### 4. プロンプトとルール

- **プロンプトテンプレート**: `system-prompt.md` など、AIへの指示を記述します。
- **コーディングルール**: `rulesPath`に指定したディレクトリに、章ごとにMarkdownファイルとして記述します。

コーディングルールは、以下のガイドラインに従ってMarkdownファイルとして記述します。

- **小単位での分割**: 各ルールセットは、複数のMarkdownファイルに分割して定義することを推奨します。これにより、ルールの管理と再利用が容易になります。
- **章の定義**: 章のヘッダーは `##` (H2) を使用して定義します。例: `## 1. コード品質ルール`
- **ルールの定義**: 各ルールのヘッダーは `###` (H3) 以降の階層（`###`, `####` など）を使用して定義します。例: `### 1.1 命名規則`
- **ファイル命名規則**: ルールファイルは `01_xxxx.md` の形式で命名する必要があります。`01`のような数字は、ルールが適用される章の番号と一致させることが推奨されます。例: `01_naming_conventions.md`

**コーディングルールの記述例:**

```markdown
## 1. コード品質ルール

### 1.1 命名規則

変数名と関数名は説明的であり、camelCaseに従う必要があります。

### 1.2 関数の複雑さ

関数は小さく、単一の責務に集中する必要があります。

## 2. セキュリティルール

### 2.1 SQLインジェクション対策

ユーザー入力は、SQLクエリに直接組み込む前に必ずサニタイズまたはプレースホルダーを使用する必要があります。
```

詳細な設定方法は、各ファイルのサンプルを参照してください。

## 動作の仕組み

1. **コード取得**: ローカルファイル、Git差分、またはGitHub（`gh` CLI経由）からコードを取得
2. **ルールセット選択**: ファイルパターンマッチングに基づいて適用するルールセットを決定
3. **章フィルタリング**: `chapterFilePatterns`設定に基づいて、ファイルごとにレビューする章を選択
4. **並列レビュー実行**:
   - ファイル × ルールセットの組み合わせを並列処理
   - 各章を複数回（`reviewIterations`）並列にレビュー
   - 同時実行数は`maxConcurrentReviews`で制御
5. **重複除外**: 同一ルールID・同一行番号の指摘を自動的に統合
6. **結果集約**:
   - 複数回のイテレーション結果を集約
   - `issueDetectionThreshold`に基づいて偽陽性をフィルタリング
7. **偽陽性チェック**: 疑わしい検出結果を複数回チェックして誤検知を除外
8. **出力生成**: Copilot Chatに表示し、オプションでMarkdownファイルに保存

## 既知の問題

- 大規模なファイルのレビューには時間がかかる場合があります
- GitHub APIのレート制限が適用される場合があります

## リリースノート

### 0.1.2 - 2025-01-XX

#### 追加
- `maxRetries` 設定を追加（デフォルト: 3）
  - Rate limitエラー発生時のリトライ回数を設定可能に
  - リトライ上限超過時に特別なNG issueを生成し、レビュー結果に含める
  - チャット欄にリトライ設定を表示

#### 変更
- 並列実行制限の改善
  - ConcurrencyQueueをシンプルなsemaphore実装に変更
  - リトライロジックをキュー内部に統合し、スロット管理を改善
  - リクエスト間の最小遅延を1000msに延長（Rate limit対策を強化）
- ログ出力の改善
  - キューイングログを状況変化時のみ出力に変更（ノイズ削減）
  - "Rate limit delay"メッセージを"Applying delay between requests"に変更（誤解を防ぐ）
- チャット出力を削除
  - VSCodeフリーズ防止のため、詳細なレビュー結果のチャット出力を廃止
  - チャット欄にはサマリー（総問題数、保存ファイルリンク）のみ表示
  - 詳細な結果はファイル出力で確認

#### 削除
- `fileOutput.enabled` 設定を廃止
  - ファイル出力は常に有効（設定不要）
  - `settings.json`から`enabled`プロパティを削除

### 0.1.1 - 2025-01-XX

#### 追加
- テンプレート変数: レビュー統計情報をサポート
  - `{reviewIterations}` - チャプターのレビュー回数
  - `{ngCount}` - チャプターで検出されたNG数
  - `{ngRate}` - NG率（ngCount / reviewIterations）
  - `{detectionCount}` - 問題が検出された回数
  - `{detectionRate}` - 検出率（%）

#### 変更
- テンプレート表示形式を改善: 検出回数の後に括弧内で検出率（%）を表示
- テーブル形式から検出率の独立カラムを削除し、検出回数カラムに統合

#### 修正
- テンプレート変数が置換されずにそのまま出力される問題を修正
- 変数置換ロジックを改善（チャプターレベル、ルールレベル、テーブルフォーマット）

#### 削除
- 拡張機能アクティブ化時の自動出力パネル表示を廃止

### 0.1.0 - 2025-01-XX

- 初期リリース

## ライセンス

MIT

## 付録: 設定例とディレクトリ構造

### 1. ディレクトリ構造の例

```
.vscode/coding-rule-checker/
├── java-rule/
│   ├── rules/
│   │   ├── 01_総則・適用範囲.md
│   │   ├── ... (その他のルールファイル)
│   └── rule-settings.json
├── sample-rule/
│   ├── rules/
│   │   └── ...
│   └── rule-settings.json
├── false-positive-prompt.md
├── review-prompt.md
├── review-results-template.md
├── settings.json
├── summary-prompt.md
└── system-prompt.md
```

### 2. `settings.json` の設定例

```json
{
  "model": "gpt-5-mini",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "templatesPath": ".vscode/coding-rule-checker/review-results-template.md",
  "maxConcurrentReviews": 20,
  "maxRetries": 3,
  "showRulesWithNoIssues": true,
  "outputFormat": "table",
  "issueDetectionThreshold": 0.5,
  "ruleset": {
    "java-rule": ["*.java"],
    "sample-rule": ["*.java", "*.ts"]
  },
  "fileOutput": {
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  }
}
```

### 3. `java-rule/rule-settings.json` の設定例

```json
{
  "rulesPath": ".vscode/coding-rule-checker/java-rule/rules",
  "reviewPromptPath": ".vscode/coding-rule-checker/review-prompt.md",
  "falsePositivePromptPath": ".vscode/coding-rule-checker/false-positive-prompt.md",
  "commonPromptPath": ".vscode/coding-rule-checker/java-rule/rules/01_総則・適用範囲.md",
  "reviewIterations": {
    "default": 2,
    "chapter": {
      "1": 3
    }
  },
  "falsePositiveCheckIterations": {
    "default": 2,
    "chapter": {
      "1": 3
    }
  },
  "chapterFilePatterns": {
    "1": ["*.java", "*.ts"]
  }
}
```
