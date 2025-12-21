package com.example.service;

import java.util.*;  // 違反: ワイルドカードimport
import java.io.*;    // 違反: ワイルドカードimport
import java.sql.Connection;  // 違反: 未使用import

/**
 * ユーザーサービスクラス（違反パターン集）
 */
public class UserService {

    // 違反: publicフィールド
    public String userName;

    // 違反: 定数のcamelCase命名（UPPER_SNAKE_CASEにすべき）
    private static final int maxRetryCount = 3;

    // 違反: boolean命名規則違反（isActiveやhasPermissionにすべき）
    private boolean active;
    private boolean permission;

    // 違反: raw type使用（List<String>にすべき）
    private List userList;

    // 違反: 意味のない変数名
    private String tmp;
    private int data;

    // 違反: 5引数以上のメソッド、throws Exception
    public void updateUser(String a, String b, String c, String d, String e, String f) throws Exception {
        // 違反: マジックナンバー
        if(a.length() > 10)
            System.out.println("長すぎます");  // 違反: System.out.println、ブレース省略

        // 違反: 二重スペース、行末余分スペース
        int  x = 5;

        // 違反: 例外の握りつぶし
        try {
            processData(a);
        } catch (Exception e1) {
            // 何もしない
        }

        // 違反: 無意味なループ変数（i, j以外の1文字変数）
        for(int k = 0; k < 100; k++)
            doSomething(k);  // 違反: ブレース省略
    }

    // 違反: 100行超えメソッド（擬似的に長いメソッド）
    public String processLargeData(String input1, String input2, String input3,
                                   String input4, String input5) {
        String result = "";

        // 以下、無駄に長いコード
        result += input1;
        result += input2;
        result += input3;
        result += input4;
        result += input5;

        System.out.println("処理開始");

        result += "line10";
        result += "line11";
        result += "line12";
        result += "line13";
        result += "line14";
        result += "line15";
        result += "line16";
        result += "line17";
        result += "line18";
        result += "line19";
        result += "line20";
        result += "line21";
        result += "line22";
        result += "line23";
        result += "line24";
        result += "line25";
        result += "line26";
        result += "line27";
        result += "line28";
        result += "line29";
        result += "line30";
        result += "line31";
        result += "line32";
        result += "line33";
        result += "line34";
        result += "line35";
        result += "line36";
        result += "line37";
        result += "line38";
        result += "line39";
        result += "line40";
        result += "line41";
        result += "line42";
        result += "line43";
        result += "line44";
        result += "line45";
        result += "line46";
        result += "line47";
        result += "line48";
        result += "line49";
        result += "line50";
        result += "line51";
        result += "line52";
        result += "line53";
        result += "line54";
        result += "line55";
        result += "line56";
        result += "line57";
        result += "line58";
        result += "line59";
        result += "line60";
        result += "line61";
        result += "line62";
        result += "line63";
        result += "line64";
        result += "line65";
        result += "line66";
        result += "line67";
        result += "line68";
        result += "line69";
        result += "line70";
        result += "line71";
        result += "line72";
        result += "line73";
        result += "line74";
        result += "line75";
        result += "line76";
        result += "line77";
        result += "line78";
        result += "line79";
        result += "line80";
        result += "line81";
        result += "line82";
        result += "line83";
        result += "line84";
        result += "line85";
        result += "line86";
        result += "line87";
        result += "line88";
        result += "line89";
        result += "line90";
        result += "line91";
        result += "line92";
        result += "line93";
        result += "line94";
        result += "line95";
        result += "line96";
        result += "line97";
        result += "line98";
        result += "line99";
        result += "line100";
        result += "line101";

        return result;
    }

    private void processData(String data) throws Exception {
        throw new Exception("エラー");
    }

    private void doSomething(int value) {
        // dummy
    }
}
