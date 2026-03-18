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

  type StudentSing = {
    letter : Text;
    audioBase64 : Text;
    studentId : Text;
    timestamp : Int;
  };

  type TeacherRiyaz = {
    letter : Text;
    audioBase64 : Text;
    timestamp : Int;
  };

  stable var messages : [Message] = [];
  stable var studentSings : [StudentSing] = [];
  stable var teacherRiyazList : [TeacherRiyaz] = [];

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

  // Store student singing recording for a letter
  public func storeStudentSing(
    letter : Text,
    audioBase64 : Text,
    studentId : Text
  ) : async Bool {
    let entry : StudentSing = {
      letter = letter;
      audioBase64 = audioBase64;
      studentId = studentId;
      timestamp = Time.now();
    };
    // Remove old entry for same letter+student, then add new
    let filtered = Array.filter<StudentSing>(
      studentSings,
      func(s : StudentSing) : Bool {
        not (s.letter == letter and s.studentId == studentId)
      }
    );
    let all = Array.append<StudentSing>(filtered, [entry]);
    let len = all.size();
    if (len > 50) {
      studentSings := Array.tabulate<StudentSing>(50, func(i) { all[len - 50 + i] });
    } else {
      studentSings := all;
    };
    true
  };

  // Get latest student singing for a letter
  public query func getStudentSing(letter : Text) : async ?StudentSing {
    let filtered = Array.filter<StudentSing>(
      studentSings,
      func(s : StudentSing) : Bool { s.letter == letter }
    );
    let len = filtered.size();
    if (len == 0) { null } else { ?filtered[len - 1] }
  };

  // Store teacher riyaz for a letter (overwrites)
  public func storeTeacherRiyaz(
    letter : Text,
    audioBase64 : Text
  ) : async Bool {
    let entry : TeacherRiyaz = {
      letter = letter;
      audioBase64 = audioBase64;
      timestamp = Time.now();
    };
    let filtered = Array.filter<TeacherRiyaz>(
      teacherRiyazList,
      func(r : TeacherRiyaz) : Bool { r.letter != letter }
    );
    teacherRiyazList := Array.append<TeacherRiyaz>(filtered, [entry]);
    true
  };

  // Get teacher riyaz for a letter
  public query func getTeacherRiyaz(letter : Text) : async ?TeacherRiyaz {
    let filtered = Array.filter<TeacherRiyaz>(
      teacherRiyazList,
      func(r : TeacherRiyaz) : Bool { r.letter == letter }
    );
    if (filtered.size() == 0) { null } else { ?filtered[0] }
  };

}
