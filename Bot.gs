//doPost takes the incoming data payload and calls the appropriate functions
function doPost(e) {
  var response;
  
  if (e.parameter.payload) {var errorOutput = clickResponse(e) } else {var errorOutput = dialogBuilder(e.parameter.command,e.parameter.trigger_id,e.parameter.user_id)};
  if (!errorOutput) {response = ContentService.createTextOutput("");
    } else {response = ContentService.createTextOutput(errorOutput).setMimeType(ContentService.MimeType.JSON);}
  
  return response;
}

//Respond to a button press
function clickResponse(e) {
  var inputJSON = JSON.parse(e.parameters.payload);
  
  var validationOutput = "";
  
  if (inputJSON.callback_id == "new_spare_request") {
    dialogBuilder("/request",inputJSON.trigger_id);
    }
  
  if (inputJSON.callback_id == "fill_spare_request") {
    dialogBuilder("/fill",inputJSON.trigger_id);
    }

  if (inputJSON.callback_id == "cancel_spare_request") {
    dialogBuilder("/cancel",inputJSON.trigger_id);
    }
    
  if (inputJSON.callback_id == "list_requests") {
    dialogBuilder("/list",inputJSON.trigger_id);
    }  
  
  if (inputJSON.callback_id == "request_diag") {
    
    var userID = inputJSON.user.id;
    var caller = queryUserInfo(userID).user.profile.real_name;
    var date = inputJSON.submission.date_input;
    var league = inputJSON.submission.league_selection.replace(/["]+/g, '');
    var drawTime = inputJSON.submission.draw_time_selection;
    
    validationOutput = evaluateDiagInput("",league, date, drawTime,"","request");
    
    if (validationOutput[0] != 1) {return JSON.stringify(validationOutput[1])};
    
    requestSpare(userID,caller, league,date,drawTime);
  } //End request_diag case
  
  if (inputJSON.callback_id == "fill_diag") {
    var userID = inputJSON.user.id;
    var caller = queryUserInfo(userID).user.profile.real_name;
    var requestID = inputJSON.submission.fill_selection;
    
    fillSpare(userID, caller,requestID);
  } //End fill_diag case
  
  if (inputJSON.callback_id == "cancel_diag") {
    var userID = inputJSON.user.id;
    var caller = queryUserInfo(userID).user.profile.real_name;
    var requestID = inputJSON.submission.cancel_selection;
    validationOutput = evaluateDiagInput(caller,"","","",requestID, "cancel");
    
    if (validationOutput[0] != 1) {return JSON.stringify(validationOutput[1])};
    
    cancelRequest(userID,requestID);
  } //End cancel_diag
}

//Validate input from the dialog boxes
function evaluateDiagInput(caller,league, date, time, requestID, action) {
  var validationResponse;
  var errorList = [];
  var errorPayload;
  var validInput = 0;
  
  if (action == "request") {
    var key = time;
    var validTime = 0;
    var validDate = 0;
    var okDrawTimes = {"4:30PM": ["Saturday Open"], 
                       "4:45PM": ["Pizza League"],
                       "6:30PM": ["TGIF Early"],
                       "7:15PM": ["Men's League", "Monday Doubles", "Women's League", "Tuesday Social", "Capital League", "Thursday Night Open", "Pizza League"],
                       "8:45PM": ["TGIF Late"],
                       "9:30PM": ["Men's League", "Monday Doubles", "Women's League", "Tuesday Social", "Capital League", "Thursday Night Open"]};                   
   
    var drawValidation = okDrawTimes[key];

    for (var i=0; i<drawValidation.length; i++) {
      if (league == drawValidation[i]) {validTime = 1;}
    }
    if (validTime !=1) {errorList.push({ name: "draw_time_selection", error: "Invalid draw time for selected league."});}

    var dateState = date.match(/^(\d+)\/(\d+)\/(\d+)$/);

    if (dateState != null) {
      var m = dateState[1]; 
      var d = dateState[2];
      var y = dateState[3];

      if ( (m < 13 && m > 0) && (d < 32 && d>0) && y > 17 ) {
        if ( (m == 2) && (d<29)) {validDate = 1;}
        if ( (m == 4 || m == 6 || m == 9 || m == 11) && (d<31)) {validDate = 1;}
        if ( (m == 1 || m == 3 || m == 5 || m == 7 || m == 8 || m == 10 || m == 12) && (d<32)) {validDate = 1;}
      }
    }
    
    if (validDate != 1) {errorList.push({ name: "date_input", error: "Invalid date entered."});}
    
    if (validDate == 1 && validTime == 1) {
    validInput = 1; 
    errorPayload = HtmlService.createHtmlOutput();
    } else {errorPayload = { errors: errorList};}
  }//End if case for 'request'
  
  if (action == "cancel") {
    var sheet = getSpareSheet("Spare Request Sheet");
    var rowNum = findRequest(sheet, requestID);
    if (sheet.getRange('A'+rowNum).getValue() == caller) {
      validInput = 1;
      errorPayload = HtmlService.createHtmlOutput();
      } else {errorPayload = { errors: [{name: "cancel_selection", error: "Name does not match spare request creator."}]};}
  }//End if case for 'cancel'
  
  var status = [validInput, errorPayload];
  return status;
}

//showHelp function is no longer strictly necessary but I'm keeping it in for testing purposes
function showHelp(){
  Logger.log('in ShowHelp()\n'); 
  var message = "*Available commands:*\n\n";
  message += "- *help*: Lists availible commands.\n";
  message += "- *request <date> <draw time>*: Request a spare.  Leauge, date, and draw time must be provided.\n";
  message += "- *fill <name>*: Fill <name>'s spare request.\n";
  message += "- *cancel <date> <draw time>*: Cancel a submitted spare request.\n";
  message += "- *list*: List all open spare requests.\n";

  sendMessage(message);
}


//Append a new spare request to the spreadsheet and return the requestID
function requestSpare(userID,caller,league,date,drawTime) {
  var sheet = getSpareSheet("Spare Request Sheet");
  
  var requestID = randIdGen();
  
  sheet.appendRow([caller,league,requestID,date,drawTime,"Open"]);
  
  var message = "*Spare requested for:* "+caller+" *on* "+date+".\n";
  message += "*Request ID is:* "+requestID+"\n";

  var jsonToken = 'Bearer '+getProperty("API_TOKEN");
    
  var options = {
    'method': 'post',
    'headers': {'Authorization': jsonToken},
    'contentType': 'application/json;charset=utf-8',
    'payload': JSON.stringify({ 'channel': userID, 'text': message})
  };
  UrlFetchApp.fetch('https://slack.com/api/chat.postMessage',options);
}


//Find the request that user is attempting to fill and mark as filled/filled by user_name
function fillSpare(userID, caller, requestID) {
  var sheet = getSpareSheet("Spare Request Sheet");
  var rowNum = findRequest(sheet, requestID);
  
  sheet.getRange('F'+rowNum).setValue('Filled!');
  sheet.getRange('G'+rowNum).setValue(caller);
  
  var message = "*Spare request* "+requestID+" *filled!*\n";
  
  var jsonToken = 'Bearer '+getProperty("API_TOKEN");
    
  var options = {
    'method': 'post',
    'headers': {'Authorization': jsonToken},
    'contentType': 'application/json;charset=utf-8',
    'payload': JSON.stringify({ 'channel': userID, 'text': message})
  };
  UrlFetchApp.fetch('https://slack.com/api/chat.postMessage',options);
}


//Cancel an existing request
function cancelRequest(userID, requestID) {
  var sheet = getSpareSheet("Spare Request Sheet");
  
  var rowNum = findRequest(sheet, requestID);
  
  //if (sheet.getRange('A'+rowNum).getValue() == caller) {
  sheet.deleteRow(rowNum);
  var message = "*Request* "+requestID+" *deleted.*\n";
  
  var jsonToken = 'Bearer '+getProperty("API_TOKEN");
    
  var options = {
    'method': 'post',
    'headers': {'Authorization': jsonToken},
    'contentType': 'application/json;charset=utf-8',
    'payload': JSON.stringify({ 'channel': userID, 'text': message})
  };
    
  UrlFetchApp.fetch('https://slack.com/api/chat.postMessage',options);
  //sendMessage(message);

}


//List all open requests
function listRequests(value) {
  var sheet = getSpareSheet("Spare Request Sheet");

  var allStatus = sheet.getRange(2,6,sheet.getLastRow()).getValues();
  var rowNums = [];
  
  var openSpareRequests = [];
  var requestIndex = [];
  
  for (var i=0; i<allStatus.length; i++) {
    if (allStatus[i] != "Filled!") {
      rowNums.push(i+2);
     }
  }
  
  if (rowNums.length == 0) {
    openSpareRequests.push("No open requests found.\n");
  } else {
    for (i=0; i<rowNums.length-1; i++) {
      openSpareRequests.push("*Request ID:* "+sheet.getRange('C'+rowNums[i]).getValue()+" "+
                             "*Player:* "+sheet.getRange('A'+rowNums[i]).getValue()+" "+
                             "*League:* "+sheet.getRange('B'+rowNums[i]).getValue()+" " +
                             "*Date:* "+sheet.getRange('D'+rowNums[i]).getValue().toDateString()+" "+
                             "*Draw Time:* "+sheet.getRange('E'+rowNums[i]).getValue().toLocaleTimeString('en-US'));
      requestIndex.push(sheet.getRange('C'+rowNums[i]).getValue());
    }
  }
  
  if (value == "id"){
    return requestIndex;
  }
  
  if (value == "list"){
    return openSpareRequests;
  }
  
  if (value == "all"){
    return [openSpareRequests,requestIndex];
  }
}

//Button Construction and Interaction handling

function dialogBuilder(commandReceived, triggerID, userID) {
  
  if (commandReceived == "/request") {
    var sheet = getSpareSheet("League Info");
    
    var leagueNames = sheet.getRange(1,1,1,sheet.getLastColumn());
    var leagueMenu = [];
    
    for (i=0; i<sheet.getLastColumn();i++) {
      leagueMenu.push({
        label: sheet.getRange(1,i+1).getValue(),
        value: JSON.stringify(sheet.getRange(1,i+1).getValue())
      });
     }
    
    var drawTimes = ["4:30PM","4:45PM","6:30PM","7:15PM","9:30PM"];
    var drawMenu = [];
    
    for (i=0; i<drawTimes.length; i++) {
      drawMenu.push({
        label: drawTimes[i],
        value: drawTimes[i]
      });
     }
    
    var payload = {
        trigger_id: triggerID,
        dialog: {
          callback_id: "request_diag",
          title: "New Spare Request",
          submit_label: "Request",
          notify_on_cancel: true,
          elements: [
            {
              label: "League",
              type: "select",
              name: "league_selection",
              options: leagueMenu
            },
            {
              label: "Draw Time",
              type: "select",
              name: "draw_time_selection",
              options: drawMenu
            },
            {
              label: "Date",
              name: "date_input",
              type: "text",
              placeholder: "mm/dd/yy"
            }]
        }
    };
   
    var jsonToken = 'Bearer '+getProperty("API_TOKEN");
    var options = {
      'method': 'post',
      'headers': {'Authorization': jsonToken},
      'contentType': 'application/json;charset=utf-8',
      'payload': JSON.stringify(payload)
     };
     
     var response = UrlFetchApp.fetch('https://slack.com/api/dialog.open',options);
     //sendMessage(response.getContentText());
   } //End if for 'Request' Case   

  if (commandReceived == "/fill") {
    var requestID = listRequests("id");
  
    var openMenu =[];
    
    for (var i=0; i<requestID.length; i++) {
      openMenu.push({
        label: requestID[i],
        value: requestID[i]})
    }

    var payload = {
        trigger_id: triggerID,
        dialog: {
          callback_id: "fill_diag",
          title: "Fill Request",
          submit_label: "Fill",
          notify_on_cancel: true,
          elements: [
            {
              label: "Input Request ID",
              type: "select",
              name: "fill_selection",
              options: openMenu
            }]
        }
    };

    var jsonToken = 'Bearer '+getProperty("API_TOKEN");
    var options = {
      'method': 'post',
      'headers': {'Authorization': jsonToken},
      'contentType': 'application/json;charset=utf-8',
      'payload': JSON.stringify(payload)
     };
     UrlFetchApp.fetch('https://slack.com/api/dialog.open',options);
  }//End if for 'fill' case
  
  if (commandReceived == "/list") {
    var openRequests = listRequests("list");
    var message = "";
    
    for (i=0;i<openRequests.length;i++) {
      message += openRequests[i]+"\n"+"\n";
    }
    
    if (openRequests.length == 0) {
      message = "No open spare requests.";
    }
    
    var jsonToken = 'Bearer '+getProperty("API_TOKEN");
    
    var options = {
      'method': 'post',
      'headers': {'Authorization': jsonToken},
      'contentType': 'application/json;charset=utf-8',
      'payload': JSON.stringify({ 'channel': userID, 'text': message})
     };
     UrlFetchApp.fetch('https://slack.com/api/chat.postMessage',options);
     
  }//End if for 'list' case
  
  if (commandReceived == "/cancel") {
    var requestID = listRequests("id");
  
    var openMenu =[];
    
    for (var i=0; i<requestID.length; i++) {
      openMenu.push({
        label: requestID[i],
        value: requestID[i]})
    }

    var payload = {
        trigger_id: triggerID,
        dialog: {
          callback_id: "cancel_diag",
          title: "Cancel Request",
          submit_label: "Remove",
          notify_on_cancel: true,
          elements: [
            {
              label: "Input Request ID",
              type: "select",
              name: "cancel_selection",
              options: openMenu
            }]
        }
    };

    var jsonToken = 'Bearer '+getProperty("API_TOKEN");
    var options = {
      'method': 'post',
      'headers': {'Authorization': jsonToken},
      'contentType': 'application/json;charset=utf-8',
      'payload': JSON.stringify(payload)
     };
     UrlFetchApp.fetch('https://slack.com/api/dialog.open',options);    
  }//End if for the 'cancel' case
}

//Function to post messages to the channel
function sendMessage(message){
  var payload = {
    "text": message
  };

  var url = getProperty("SLACK_INCOMING_WEBHOOK");
  var options = {
    'method': 'post',
    'payload': JSON.stringify(payload)
  };
  
  UrlFetchApp.fetch(url, options);
}

//Function to send data payload to SLACK
function sendPayload(payload, method, url){
  if (!url){
    var url = getProperty("SLACK_INCOMING_WEBHOOK");
    }
  var options = {
    'method': method,
    'payload': JSON.stringify(payload)
   };
   
  UrlFetchApp.fetch(url,options);
}


//Function to find the row number that cooresponds to a given requestID, if it exists
function findRequest(sheet, requestId) {
  var columnValues = sheet.getRange(2,3,sheet.getLastRow()).getValues();
  for (var i=0; i<columnValues.length; i++) {
    if (columnValues[i] == requestId) {
      var rowNum = i+2;
      return rowNum;
    }
  }
  var message = "Request ID not found!\n";
  sendMessage(message);
  throw '';
}


//Simple 9 charector random string generator
function randIdGen() {
  var id = "";
  var termList = ["backline","biter","blank","end",
                  "bonspiel","brush","burned","stone",
                  "button","counter","curl","draw",
                  "weight","guard","hacks","hammer",
                  "heavy","hit","hog","line","house",
                  "in-turn","lead","out-turn","pebble",
                  "raise","roll","second","sheet","shot",
                  "skip","spare","slider","sweep","take-out",
                  "tee-line","vice"];
  
  var adjList = ["safe","sturdy","terrible","obnoxious","fierce",
                 "splendid","fancy","pleasant","wandering","real",
                 "roomy","humorous","overconfident","debonair","wry",
                 "foolish","lively","premium","acrid","sneaky",
                 "ritzy","cooperative","mighty","humble","intense"];
  
  id += adjList[Math.floor(Math.random()*adjList.length)]+"_"+termList[Math.floor(Math.random()*termList.length)];
  
  return id;
}


//return the value of the given script property
function getProperty(propertyName){
  return PropertiesService.getScriptProperties().getProperty(propertyName);
}


//return the spreadsheet object
function getSpareSheet(name){
  return SpreadsheetApp.openById(getProperty("SPREADSHEET_ID")).getSheetByName(name);
}

function queryUserInfo(userID) {

  var payload = {token: getProperty("API_TOKEN"), user: userID};
  var url = "https://slack.com/api/users.info";
  var options = {
    'method': 'get',
    'payload': payload
  };
  
  var userInfo = JSON.parse(UrlFetchApp.fetch(url, options));
  return userInfo;
}
