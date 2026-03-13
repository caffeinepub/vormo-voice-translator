import Array "mo:base/Array";
import Time "mo:base/Time";

actor {

  type Message = {
    roomId : Text;
    deviceId : Text;
    sourceLang : Text;
    sourceText : Text;
    translatedText : Text;
    timestamp : Int;
  };

  stable var messages : [Message] = [];

  public func postMessage(
    roomId : Text,
    deviceId : Text,
    sourceLang : Text,
    sourceText : Text,
    translatedText : Text
  ) : async Bool {
    let msg : Message = {
      roomId = roomId;
      deviceId = deviceId;
      sourceLang = sourceLang;
      sourceText = sourceText;
      translatedText = translatedText;
      timestamp = Time.now();
    };
    let all = Array.append<Message>(messages, [msg]);
    let len = all.size();
    if (len > 200) {
      messages := Array.tabulate<Message>(200, func(i) { all[len - 200 + i] });
    } else {
      messages := all;
    };
    true
  };

  // Returns messages for a room that were NOT sent by this device
  public query func getMessages(
    roomId : Text,
    notFromDevice : Text,
    afterTimestamp : Int
  ) : async [Message] {
    Array.filter<Message>(
      messages,
      func(m : Message) : Bool {
        m.roomId == roomId
          and m.deviceId != notFromDevice
          and m.timestamp > afterTimestamp
      }
    )
  };

}
