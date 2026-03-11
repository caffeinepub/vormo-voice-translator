import Map "mo:core/Map";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Int "mo:core/Int";

actor {

  type Message = {
    id : Text;
    fromUser : Text;
    forUser : Text;
    sourceText : Text;
    translatedText : Text;
    direction : Text;
    timestamp : Int;
  };

  type Room = {
    var userA : Bool;
    var userB : Bool;
    var userALastSeen : Int;
    var userBLastSeen : Int;
    var messages : [Message];
    created : Int;
  };

  let rooms = Map.empty<Text, Room>();

  func genCode(seed : Int) : Text {
    let chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let arr = chars.toIter().toArray();
    let n = arr.size();
    var s = seed;
    var result = "";
    var i = 0;
    while (i < 6) {
      let idx = Int.abs(s) % n;
      result := result # Text.fromChar(arr[idx]);
      s := s / 31 + 7919;
      i += 1;
    };
    result
  };

  public func createRoom() : async { roomCode : Text; userId : Text } {
    let t = Time.now();
    let code = genCode(t);
    let room : Room = {
      var userA = true;
      var userB = false;
      var userALastSeen = t;
      var userBLastSeen = 0;
      var messages = [];
      created = t;
    };
    rooms.add(code, room);
    { roomCode = code; userId = "A" }
  };

  public func joinRoom(roomCode : Text) : async { #ok : { userId : Text }; #err : Text } {
    switch (rooms.get(roomCode)) {
      case null { #err "Room not found" };
      case (?room) {
        if (room.userB) {
          #err "Room is full"
        } else {
          room.userB := true;
          room.userBLastSeen := Time.now();
          #ok { userId = "B" }
        }
      };
    }
  };

  public func heartbeat(roomCode : Text, userId : Text) : async Bool {
    switch (rooms.get(roomCode)) {
      case null { false };
      case (?room) {
        if (userId == "A") { room.userALastSeen := Time.now() }
        else { room.userBLastSeen := Time.now() };
        true
      };
    }
  };

  public func postMessage(
    roomCode : Text,
    fromUser : Text,
    sourceText : Text,
    translatedText : Text,
    direction : Text
  ) : async Bool {
    switch (rooms.get(roomCode)) {
      case null { false };
      case (?room) {
        let forUser = if (fromUser == "A") "B" else "A";
        let t = Time.now();
        let msg : Message = {
          id = t.toText();
          fromUser;
          forUser;
          sourceText;
          translatedText;
          direction;
          timestamp = t;
        };
        room.messages := room.messages.concat([msg]);
        true
      };
    }
  };

  public query func getNewMessages(
    roomCode : Text,
    forUser : Text,
    afterTimestamp : Int
  ) : async [Message] {
    switch (rooms.get(roomCode)) {
      case null { [] };
      case (?room) {
        room.messages.filter(func(m : Message) : Bool {
          m.forUser == forUser and m.timestamp > afterTimestamp
        })
      };
    }
  };

  public query func getRoomStatus(roomCode : Text) : async {
    usersConnected : Nat;
    userAOnline : Bool;
    userBOnline : Bool;
  } {
    switch (rooms.get(roomCode)) {
      case null { { usersConnected = 0; userAOnline = false; userBOnline = false } };
      case (?room) {
        let now = Time.now();
        let threshold = 10_000_000_000;
        let aOnline = room.userA and (now - room.userALastSeen) < threshold;
        let bOnline = room.userB and (now - room.userBLastSeen) < threshold;
        let count = (if (aOnline) 1 else 0) + (if (bOnline) 1 else 0);
        { usersConnected = count; userAOnline = aOnline; userBOnline = bOnline }
      };
    }
  };
};
