var NLIs = [];
fetch("http://162.105.88.99:8080/NLI")
    .then(function (response) {
        return response.json();
    }).then(function (rawNLIs) {
        rawNLIs.forEach(rawNLI => {
            nli = {};
            nli["caption"] = rawNLI["functionalFeature"];
            nli["snippet"] = rawNLI["functionalFeature"] + " {\n";
            nli["info"] = rawNLI["info"];
            rawNLI["info"].forEach(argInfo => {
                nli["snippet"] += "\t" + argInfo + " : \n";
            });
            nli["snippet"] += "}"

            nli["code"] = "";
            rawNLI["text"].forEach(codeFrag => {
                nli["code"] += codeFrag;
            });

            nli["meta"] = "NLI";
            nli["type"] = "text";
            nli["score"] = 100;
            nli["completer"] = nliCompleter;
            nli["types"] = [];
            rawNLI["type"].forEach(type => {
                nli["types"].push(type);
            });

            nli["imports"] = [];
            for(key in rawNLI["symbol"]){
                nli["imports"].push(rawNLI["symbol"][key]);
            };
            
            NLIs.push(nli);
        });
        return NLIs;
    });
    
    var editor = ace.edit("editor");
    editor.setTheme("ace/theme/monokai");
    editor.session.setMode("ace/mode/java");


    //自动换行,设置为off关闭
    editor.setOption("wrap", "free");
    //启用提示菜单
    var langTools = ace.require("ace/ext/language_tools");
    //以下部分是设置输入代码提示的
    editor.setOptions({
        enableBasicAutocompletion: true,
        enableSnippets: true,
        enableLiveAutocompletion: true
    });
    editor.setHighlightActiveLine(true); //代码高亮  
    editor.setShowPrintMargin(false);  
    //editor.setTheme(&#39;ace/theme/solarized_dark&#39;); //引入模板  
    editor.getSession().setUseWorker(false);  
    editor.getSession().setUseWrapMode(true); //支持代码折叠  
    //editor.getSession().setMode(&#39;ace/mode/javascript&#39;); //设置语言模式  
    editor.selection.getCursor(); //获取光标所在行或列
    //editor.gotoLine(lineNumber); //跳转到行
    editor.session.getLength(); //获取总行数
    // editor.insert("Something cool");
    

    var snippetManager = ace.require("./snippets").snippetManager;
    var autocomplete = ace.require("ace/autocomplete");
    var oldCompleters = [langTools.textCompleter,langTools.keyWordCompleter,langTools.snippetCompleter]
    var allImports = []
    var variableNameNum = 0;

    var HoleCompleter = function (imports,code,fillers,contextVariables,info,types,beginCursor,i) {
        this.getCompletions = function(editor, session, pos, prefix, callback) {
            /*types[i].forEach(element => {
                completions.push({
                    caption : element,
                    snippet : element + "\n",
                    meta : element,
                    type : "snippet",
                    completer : this
                });
            });*/
            var thisCompleter = this;
            fetch("http://162.105.88.99:8080/recommendation?type="+types[i] + "&info=" + info[i],{
                body : JSON.stringify(contextVariables),
                method : "POST"
            }).then(function (response) {
                return response.json();
            }).then(function (recommendations) {
                completions = []
                recommendations["entries"].forEach(recommendation => {
                    completions.push({
                        caption : recommendation["text"],
                        snippet : recommendation["text"] + "\n",
                        meta : recommendation["score"],
                        imports : recommendation["typeList"] != null? recommendation["typeList"] : [],
                        type : "text",
                        score : recommendation["score"],
                        completer : thisCompleter
                    });
                });
                callback(null,completions);
            });
        };
        this.insertMatch = function (editor,data) {
            snippet = data.snippet.substring(0,data.snippet.length-1);
            imports = imports.concat(data.imports);

            snippetManager.insertSnippet(editor, snippet);
            var oldCursor = editor.selection.getCursor();
            editor.gotoLine(oldCursor.row + 2);
            editor.navigateLineEnd();
            var newCursor = editor.selection.getCursor();

            key = "<HOLE" + i + ">";
            fillers[key] = snippet;
            editor.completer.detach();

            if (i+1 < types.length) {
                langTools.setCompleters([new HoleCompleter(imports,code,fillers,contextVariables,info,types,beginCursor,i + 1)])
                editor.completer.showPopup(editor);
                editor.completer.cancelContextMenu();
            }else{
                if (code.indexOf("_ ") != -1) {
                    code = code.replace(new RegExp("_ ","g"),"_" + variableNameNum + " ");
                    variableNameNum += 1;   
                }
                Object.keys(fillers).forEach(function (_key) {
                    code = code.replace(_key,fillers[_key]);
                });
                editor.session.replace(new ace.Range(beginCursor.row, beginCursor.column, newCursor.row, newCursor.column), "");
                snippetManager.insertSnippet(editor, code);
                console.log(imports);
                imports.forEach(importStmt => {
                    if (allImports.indexOf(importStmt) == -1) {
                        allImports.push(importStmt);
                        editor.session.insert({row: 0, column:0}, "import " + importStmt + ";\n");
                    }
                });
            }
            langTools.setCompleters(oldCompleters);
        }
    }
    
    var nliCompleter = {
        getCompletions: function(editor, session, pos, prefix, callback) {
            callback(null, NLIs);
            return
        },
        insertMatch : function (editor,data) {

            fetch("http://162.105.88.99:8080/parse?row=" + editor.selection.getCursor().row + "&column=" + editor.selection.getCursor().column,{
                body : editor.getValue(),
                method : "POST"
            }).then(function (response) {
                return response.json();
            }).then(function (parseResult) {
                console.log(parseResult);
                allImports = parseResult.imports;
                langTools.setCompleters([new HoleCompleter(data.imports,data.code,[],parseResult.contextVariables,data.info,data.types,cursor,0)]);
                editor.completer.showPopup(editor);
                editor.completer.cancelContextMenu();
                langTools.setCompleters(oldCompleters);
            });

            var cursor = editor.selection.getCursor();
            snippetManager.insertSnippet(editor, data.snippet);

            editor.completer.detach();

            editor.gotoLine(cursor.row + 2);
            editor.navigateLineEnd();
        }
    }
    
    //langTools.addCompleNLI);
    var myAutoComplete = autocomplete.Autocomplete.for(editor);
    myAutoComplete.insertMatch = function(data, options) {
        if (!data)
            data = this.popup.getData(this.popup.getRow());
        if (!data)
            return false;

        if (data.completer && data.completer.insertMatch) {
            if (this.completions.filterText) {
                var ranges = this.editor.selection.getAllRanges();
                for (var i = 0, range; range = ranges[i]; i++) {
                    range.start.column -= this.completions.filterText.length;
                    this.editor.session.remove(range);
                }
            }
            data.completer.insertMatch(this.editor, data);
        } else {
            if (this.completions.filterText) {
                var ranges = this.editor.selection.getAllRanges();
                for (var i = 0, range; range = ranges[i]; i++) {
                    range.start.column -= this.completions.filterText.length;
                    this.editor.session.remove(range);
                }
            }
            if (data.snippet)
                snippetManager.insertSnippet(this.editor, data.snippet);
            else
                this.editor.execCommand("insertstring", data.value || data);
            this.detach();
        }
    };



    editor.commands.addCommand({
        name: 'myCommand',
        bindKey: {win: 'Ctrl-X',  mac: 'Command-X'},
        exec: function(editor) {
            //...
            //editor.insert("Something cool");
            langTools.setCompleters([nliCompleter]);
            //completer = autocomplete.Autocomplete.for(editor);
            myAutoComplete.autoInsert = false;
            myAutoComplete.autoSelect = true;
            myAutoComplete.showPopup(editor);
            myAutoComplete.cancelContextMenu();
            langTools.setCompleters(oldCompleters);
            //completer.detach()
            //editor.gotoLine(3);

        },
        readOnly: true // false if this command should not apply in readOnly mode
    });

    editor.commands.addCommand({
        name: 'myCommand2',
        bindKey: {win: 'Ctrl-K',  mac: 'Command-K'},
        exec: function(editor) {
            var cursor = editor.selection.getCursor();
            editor.session.replace(new ace.Range(cursor.row, cursor.column, cursor.row, cursor.column), "new text");
            editor.selection.moveTo(cursor.row,cursor.column);
            //console.log(NLIs)
        },
        readOnly: true // false if this command should not apply in readOnly mode
    });