import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import Iter "mo:base/Iter";

actor {

  type Room = {
    var userCount: Nat;
    var messagesFor0: Buffer.Buffer<Text>;
    var messagesFor1: Buffer.Buffer<Text>;
  };

  let rooms = HashMap.HashMap<Text, Room>(10, Text.equal, Text.hash);

  public func createRoom(roomCode: Text) : async Bool {
    switch (rooms.get(roomCode)) {
      case (?_) { false };
      case null {
        let room : Room = {
          var userCount = 1;
          var messagesFor0 = Buffer.Buffer<Text>(4);
          var messagesFor1 = Buffer.Buffer<Text>(4);
        };
        rooms.put(roomCode, room);
        true
      };
    }
  };

  public func joinRoom(roomCode: Text) : async { #ok: Nat; #err: Text } {
    switch (rooms.get(roomCode)) {
      case null { #err("Room not found") };
      case (?room) {
        if (room.userCount >= 2) {
          #err("Room is full")
        } else {
          let slot = room.userCount;
          room.userCount += 1;
          #ok(slot)
        }
      };
    }
  };

  public func sendMessage(roomCode: Text, senderSlot: Nat, text: Text) : async Bool {
    switch (rooms.get(roomCode)) {
      case null { false };
      case (?room) {
        if (senderSlot == 0) {
          room.messagesFor1.add(text);
        } else {
          room.messagesFor0.add(text);
        };
        true
      };
    }
  };

  public func getMessages(roomCode: Text, recipientSlot: Nat) : async [Text] {
    switch (rooms.get(roomCode)) {
      case null { [] };
      case (?room) {
        let buf = if (recipientSlot == 0) { room.messagesFor0 } else { room.messagesFor1 };
        let msgs = Buffer.toArray(buf);
        buf.clear();
        msgs
      };
    }
  };

  public func roomExists(roomCode: Text) : async Bool {
    switch (rooms.get(roomCode)) {
      case null { false };
      case (?_) { true };
    }
  };

}
