# Code Review Report

## File Information

- **File Name**: BusinessException.java
- **File Path**: https://github.com/asaomaro/study/commit/8cb5bbd922f8f2693f48c5771d395992333c768d#project/RPGtoSPA/ap/src/main/java/rpgtospa/common/exception/BusinessException.java
- **Diff Details**: 8cb5bbd922f8f2693f48c5771d395992333c768d

## Summary

- **Total Issues**: 16

---

## Review Results: java-rule

### 2. ファイル構成・パッケージ宣言・import の扱い

- NG1 : 7
    - NGコードスニペット:
        ```text
        import rpgtospa.common.validation.bldto.ErrorDataBlDto;
import lombok.Data;
import lombok.EqualsAndHashCode;
        ```
    - NG理由:
        インポートの並び順が規則に従っていません。規則は java.* → javax.* → 外部ライブラリ → 自作パッケージ の順を要求しますが、プロジェクト内パッケージ (rpgtospa.*) が外部ライブラリ (lombok) より前に来ています。
    - 修正案:
        外部ライブラリの import（lombok）を自作パッケージの import より前に移動してください。例えば：
import lombok.Data;
import lombok.EqualsAndHashCode;
import rpgtospa.common.validation.bldto.ErrorDataBlDto;
- NG2 : 7
    - NGコードスニペット:
        ```text
        3: import java.math.BigDecimal;
4: import java.util.ArrayList;
5: import java.util.List;
6: 
7: import rpgtospa.common.validation.bldto.ErrorDataBlDto;
8: import lombok.Data;
9: import lombok.EqualsAndHashCode;
        ```
    - NG理由:
        自作パッケージの import (rpgtospa...) が外部ライブラリ (lombok) より前に来ており、指定された並び順に違反している。
    - 修正案:
        外部ライブラリの import (lombok) を自作パッケージより前に移動し、グループごとに空行で区切る。例順序:
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import lombok.Data;
import lombok.EqualsAndHashCode;

import rpgtospa.common.validation.bldto.ErrorDataBlDto;
### 3. コーディングスタイル（インデント・改行・空白・括弧）

- NG1 : 28
    - NGコードスニペット:
        ```text
        public void addError(String targetId, String message, String errorCode, String targetParentId,BigDecimal targetRowIndex) {
        ```
    - NG理由:
        パラメータリストのカンマの後にスペースがありません（`String targetParentId,BigDecimal`）。コーディングルールではカンマ後にはスペースが必要です。
    - 修正案:
        カンマの後にスペースを挿入します。例: `public void addError(String targetId, String message, String errorCode, String targetParentId, BigDecimal targetRowIndex) {`
### 5. クラス／インタフェース設計の基本ルール

- NG1 : 16
    - NGコードスニペット:
        ```text
        11: @Data
16:     private List<ErrorDataBlDto> errorList = new ArrayList<>();
        ```
    - NG理由:
        Lombokの @Data (line 11) により errorList の public な getter/setter が自動生成され、内部の可変なListが外部に直接公開されます。ルール「最小限の public」を侵害し、カプセル化が破られます。
    - 修正案:
        不要な公開アクセサを生成しないように Lombok の @Data を使わず、必要最小限のアクセサのみ定義してください。具体的には：
- errorList を final にし、setter を削除する。
- 外部へは Collections.unmodifiableList(errorList) を返すカスタム getter を実装する、またはコピーを返す。
- Lombok を使う場合は @Getter を限定的に（errorList に対しては付けないか @Getter(AccessLevel.NONE)）使用する。
例: public List<ErrorDataBlDto> getErrorList() { return Collections.unmodifiableList(errorList); }
- NG2 : 11
    - NGコードスニペット:
        ```text
        @Data
@EqualsAndHashCode(callSuper = true)
public class BusinessException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private List<ErrorDataBlDto> errorList = new ArrayList<>();
        ```
    - NG理由:
        The Lombok @Data annotation generates public getters and setters (including setErrorList) for non-final fields. This exposes the internal mutable list (errorList) and increases the public API surface, violating the rule to keep public members to a minimum.
    - 修正案:
        Remove @Data. Use @Getter (or explicitly declare a getter) and keep @EqualsAndHashCode(callSuper = true) if needed. Make errorList private and final, and return an unmodifiable view from the getter (e.g. Collections.unmodifiableList(errorList)). Keep the addError(...) methods as the only ways to mutate the list.
### 6. メソッド設計（引数・戻り値・副作用）

- NG1 : 28
    - NGコードスニペット:
        ```text
        public void addError(String targetId, String message, String errorCode, String targetParentId,BigDecimal targetRowIndex) {
        ```
    - NG理由:
        メソッドが5つの引数を受け取っており、ルール「5引数以上禁止」に違反しています。可読性と保守性が低下します。
    - 修正案:
        引数を3つ以下に削減するため、ErrorDataBlDto を引数として受け取るか、パラメータオブジェクト（例えば ErrorDataBlDto または builder）を導入してください。例: public void addError(ErrorDataBlDto errorData) { errorList.add(errorData); } または Optional を使う代わりに ErrorDataBlDto#setTargetParentId/ setTargetRowIndex を使って呼び出し側で組み立てるようにしてください。
- NG2 : 28
    - NGコードスニペット:
        ```text
        public void addError(String targetId, String message, String errorCode, String targetParentId,BigDecimal targetRowIndex) {
        ```
    - NG理由:
        このメソッドは引数が5つあり、ルールで禁止されている「5引数以上」に該当します。多すぎる引数は読みやすさ・保守性を低下させます。
    - 修正案:
        引数を3つ以下に削減してください。具体的には、ErrorDataBlDtoを引数として渡すか（public void addError(ErrorDataBlDto errorData)）、targetParentIdとtargetRowIndexをまとめた小さな値オブジェクト（例: ErrorTargetInfo）を作成して渡す（public void addError(String targetId, String message, String errorCode, ErrorTargetInfo targetInfo)）方法を検討してください。
### 9. 例外設計・例外処理の基本ルール

- NG1 : 18
    - NGコードスニペット:
        ```text
        public void addError(String targetId, String message, String errorCode) { ... }
        ```
    - NG理由:
        このクラスはエラー情報を内部リストに格納するのみで、例外のメッセージ（super.message）や原因(cause)を設定していません。例外がスローされたときにスタックトレースや例外メッセージから原因が分かる形になっていないため、原因追跡が困難です。
    - 修正案:
        例外のメッセージと原因を保持するために、(a) 標準的なコンストラクタを追加して super(message) / super(message, cause) を呼ぶ、または (b) getMessage() をオーバーライドして errorList から判別可能な要約メッセージを返すように実装してください。addError() 呼び出しで例外を構築する場合は、内部リストに加えるだけでなく例外メッセージを更新する処理を追加してください。
- NG2 : 13
    - NGコードスニペット:
        ```text
        11: @Data
12: @EqualsAndHashCode(callSuper = true)
13: public class BusinessException extends RuntimeException {
14:     private static final long serialVersionUID = 1L;
15:
16:     private List<ErrorDataBlDto> errorList = new ArrayList<>();
        ```
    - NG理由:
        BusinessException provides no constructors or overrides to set a clear exception message or cause. Throwing this exception with the default constructor yields null message, which violates the rule to include a cause-explaining message.
    - 修正案:
        Add explicit constructors that accept message and cause (e.g. BusinessException(String message), BusinessException(String message, Throwable cause), BusinessException(Throwable cause)) and call super(...) so thrown exceptions carry informative messages. Consider overriding getMessage() to include a summary of errorList when appropriate.
### 10. null 取り扱いと防御的コーディング

- NG1 : 18
    - NGコードスニペット:
        ```text
        public void addError(String targetId, String message, String errorCode) {
        ```
    - NG理由:
        メソッドのパラメータ (targetId, message, errorCode) に対して null チェックが行われておらず、null を渡された場合に後続処理や他クラスのsetterで意図しない動作やNullPointerExceptionが発生する可能性があります。
    - 修正案:
        パラメータ受け取り時に明示的に null をチェックする。例えば java.util.Objects.requireNonNull を使うか、許容するパラメータは明示してデフォルト値に正規化する。例:
import java.util.Objects;
public void addError(String targetId, String message, String errorCode) {
    Objects.requireNonNull(targetId, "targetId must not be null");
    Objects.requireNonNull(message, "message must not be null");
    Objects.requireNonNull(errorCode, "errorCode must not be null");
    // 既存処理...
}
- NG2 : 28
    - NGコードスニペット:
        ```text
        public void addError(String targetId, String message, String errorCode, String targetParentId,BigDecimal targetRowIndex) {
        ```
    - NG理由:
        全てのパラメータに対する null チェックが無く、特に targetRowIndex (BigDecimal) が null の場合に後続処理で NullPointerException や不正なエラー情報の格納が発生する可能性があります。また targetParentId が null を許容するならば明示的に正規化すべきです。
    - 修正案:
        必須パラメータは Objects.requireNonNull でチェックし、null を許容するパラメータはデフォルト値に正規化する。例:
import java.util.Objects;
public void addError(String targetId, String message, String errorCode, String targetParentId, BigDecimal targetRowIndex) {
    Objects.requireNonNull(targetId, "targetId must not be null");
    Objects.requireNonNull(message, "message must not be null");
    Objects.requireNonNull(errorCode, "errorCode must not be null");
    // targetParentId を許容する場合の正規化例
    String parent = (targetParentId == null) ? "" : targetParentId;
    // targetRowIndex は必須ならチェック、任意ならデフォルト
    BigDecimal rowIndex = (targetRowIndex == null) ? BigDecimal.ZERO : targetRowIndex;
    // その後 errorData に parent と rowIndex を使用する
}
- NG3 : 18
    - NGコードスニペット:
        ```text
        public void addError(String targetId, String message, String errorCode) {
    var errorData = new ErrorDataBlDto();
    errorData.setTargetId(targetId);
    errorData.setErrorMessage(message);
    errorData.setErrorCode(errorCode);
    errorData.setTargetParentId("");
    errorData.setTargetRowIndex(BigDecimal.ZERO);
    errorList.add(errorData);
}
        ```
    - NG理由:
        パラメータ targetId, message, errorCode に対する null チェックがない。null が渡された場合に NPE や不正なエラーデータが生成される恐れがある。
    - 修正案:
        必須パラメータに対して Objects.requireNonNull(targetId, "targetId") などで早期にチェックするか、入力が nullable であればメソッド仕様に明示し、null を許容する場合はデフォルト値へ置換する（例: Objects.toString(targetId, "")).
- NG4 : 28
    - NGコードスニペット:
        ```text
        public void addError(String targetId, String message, String errorCode, String targetParentId,BigDecimal targetRowIndex) {
    var errorData = new ErrorDataBlDto();
    errorData.setTargetId(targetId);
    errorData.setErrorMessage(message);
    errorData.setErrorCode(errorCode);
    errorData.setTargetParentId(targetParentId);
    errorData.setTargetRowIndex(targetRowIndex);
    errorList.add(errorData);
}
        ```
    - NG理由:
        targetParentId と targetRowIndex が null のまま設定される可能性がある。特に BigDecimal の null は後続処理で NPE を起こしやすい。
    - 修正案:
        必須パラメータは Objects.requireNonNull を使ってチェックする。nullable を許容する場合は呼び出し前に default を適用する（例: targetParentId = Objects.toString(targetParentId, ""); targetRowIndex = targetRowIndex == null ? BigDecimal.ZERO : targetRowIndex;）。
- NG5 : 11
    - NGコードスニペット:
        ```text
        @Data
@EqualsAndHashCode(callSuper = true)
public class BusinessException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private List<ErrorDataBlDto> errorList = new ArrayList<>();

        ```
    - NG理由:
        Lombok の @Data は errorList に対する公開セッターを生成するため、外部から null が代入される可能性がある（フィールドが null になるリスク）。null 防御がされていない。
    - 修正案:
        フィールドを不変にする（private final List<ErrorDataBlDto> errorList = new ArrayList<>();）か、@Data を避けて @Getter のみを使用し setter を公開しない。getter は Collections.unmodifiableList(errorList) を返すなど防御的コピーを行い、null の設定を許さない実装にする。
### 12. コメント・Javadoc ルール

- NG1 : 18
    - NGコードスニペット:
        ```text
        public void addError(String targetId, String message, String errorCode) {
    var errorData = new ErrorDataBlDto();
    errorData.setTargetId(targetId);
    errorData.setErrorMessage(message);
    errorData.setErrorCode(errorCode);
    errorData.setTargetParentId("");
    errorData.setTargetRowIndex(BigDecimal.ZERO);
    errorList.add(errorData);
}
        ```
    - NG理由:
        This is a public method and there is no Javadoc. The project rule recommends documenting public methods; documentation should explain why the method exists/behaves (reasoning), not just what it does.
    - 修正案:
        Add a Javadoc block above the method that explains why errors are added this way (e.g., to collect business validation errors for unified handling/response), and document parameters briefly. Focus on the rationale. Example:
/**
 * Adds a validation error to the aggregated error list so callers can return a single
 * set of business errors to the client. This method creates a minimal ErrorDataBlDto
 * when there is no parent/row context.
 *
 * @param targetId identifier of the target input
 * @param message user-facing error message
 * @param errorCode internal error code for mapping
 */
- NG2 : 28
    - NGコードスニペット:
        ```text
        public void addError(String targetId, String message, String errorCode, String targetParentId,BigDecimal targetRowIndex) {
    var errorData = new ErrorDataBlDto();
    errorData.setTargetId(targetId);
    errorData.setErrorMessage(message);
    errorData.setErrorCode(errorCode);
    errorData.setTargetParentId(targetParentId);
    errorData.setTargetRowIndex(targetRowIndex);
    errorList.add(errorData);
}
        ```
    - NG理由:
        This public overloaded method lacks Javadoc. According to the rule, public methods should be documented; the documentation should convey why this overload exists and when to use it (reason), not merely restate the implementation.
    - 修正案:
        Add a Javadoc block above this method explaining why the overload accepts parent/row context (e.g., to associate errors with collection items or nested fields) and describe parameters. Example:
/**
 * Adds a validation error with parent and row context so errors can be tied to
 * items within collections or nested objects when returning aggregated errors.
 *
 * @param targetId identifier of the target input
 * @param message user-facing error message
 * @param errorCode internal error code for mapping
 * @param targetParentId identifier of the parent element (if any)
 * @param targetRowIndex row index for collection items
 */

### Review Summary: java-rule
- NG数: 16
- 主な指摘: 総則・適用範囲, ファイル構成・パッケージ宣言・import の扱い, コーディングスタイル（インデント・改行・空白・括弧）, 命名規約（クラス・メソッド・変数・定数・boolean）, クラス／インタフェース設計の基本ルール, メソッド設計（引数・戻り値・副作用）, フィールド・ローカル変数・定数の扱い, コレクション・ジェネリクス利用時の基本ルール, 例外設計・例外処理の基本ルール, null 取り扱いと防御的コーディング, ログ出力ルール, コメント・Javadoc ルール, テストコード（単体テスト）の基本ルール, 非推奨事項・アンチパターン（検証対象）

---

---

Generated by Coding Rule Checker


