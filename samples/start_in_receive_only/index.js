document.addEventListener("DOMContentLoaded", () => {
  const userVideo = document.getElementById("localVideo");
  const remoteVideo = document.getElementById("remoteVideo");
  const joinButton = document.getElementById("joinButton");
  const leaveButton = document.getElementById("leaveButton");
  const startLocalVideoButton = document.getElementById("startLocalVideoButton");
  const startLocalAudioButton = document.getElementById("startLocalAudioButton");

  let gatewayUrl = "https://v1.liveswitch.fm:8443/sync";
  let applicationId = "my-app-id";
  let sharedSecret = "--replaceThisWithYourOwnSharedSecret--";
  let channelId = "start-in-receive-only-example";
  let senderClient;
  let senderChannel;
  let senderUpstreamConnection;
  let localVideo;
  let localAudio;
  let localVideoDiv;
  let remoteMedia;
  let remoteVideoDiv;
  let localMediaStarted = false;

  fm.liveswitch.Log.registerProvider(new fm.liveswitch.ConsoleLogProvider(fm.liveswitch.LogLevel.Debug));

  // Function to set up and display local video
  function initializeLocalMedias() {
    if (!localMediaStarted) {
      localVideo = new fm.liveswitch.LocalMedia(false, new fm.liveswitch.VideoConfig(640, 480, 30));
      localAudio = new fm.liveswitch.LocalMedia(true, false);
    }
  }

  // Function for sender to register with LiveSwitch Gateway and join a channel
  async function senderRegister() {
    let promise = new fm.liveswitch.Promise();
    senderClient = new fm.liveswitch.Client(gatewayUrl, applicationId);
    let channelClaims = [new fm.liveswitch.ChannelClaim(channelId)];
    let token = fm.liveswitch.Token.generateClientRegisterToken(applicationId, senderClient.getUserId(), senderClient.getDeviceId(), senderClient.getId(), null, channelClaims, sharedSecret);
    senderClient.register(token).then(channels => {
      senderChannel = channels[0];
      senderChannel.addOnRemoteUpstreamConnectionOpen(openSfuDownstreamConnection);
    }).fail(ex => {
      fm.liveswitch.Log.error("Failed to register sender.", ex);
      promise.reject(ex);
    });
    return promise;
  }

  async function openSfuUpstreamConnection() {
    let audioStream = new fm.liveswitch.AudioStream(localAudio);
    let videoStream = new fm.liveswitch.VideoStream(localVideo);
    senderUpstreamConnection = senderChannel.createSfuUpstreamConnection(audioStream, videoStream);
    return senderUpstreamConnection.open().fail(ex => {
      fm.liveswitch.Log.error("Failed to open upstream connection.", ex);
    });
  }

  async function openSfuDownstreamConnection(remoteConnectionInfo) {
    remoteMedia = new fm.liveswitch.RemoteMedia(remoteConnectionInfo.getHasAudio(), remoteConnectionInfo.getHasVideo());
    let audioStream = new fm.liveswitch.AudioStream(remoteMedia);
    let videoStream = new fm.liveswitch.VideoStream(remoteMedia);
    let conn = senderChannel.createSfuDownstreamConnection(remoteConnectionInfo, audioStream, videoStream);
    return conn.open().then(_ => {
      remoteVideoDiv = remoteMedia.getView();
      remoteVideo.appendChild(remoteVideoDiv);
    }).fail(ex => {
      fm.liveswitch.Log.error("Failed to open downstream connection.", ex);
    });
  }

  // Function to join the call
  async function joinCall() {
    joinButton.disabled = true;
    leaveButton.disabled = false;
    startLocalAudioButton.disabled = false;
    startLocalVideoButton.disabled = false;

    senderRegister();
  }

  // Function to leave the call and stop local media
  function leaveCall() {
    leaveButton.disabled = true;
    startLocalAudioButton.disabled = true;
    startLocalVideoButton.disabled = true;

    if (senderClient) {
      senderClient.unregister();
      senderClient = null;
      senderChannel = null;
      senderUpstreamConnection = null;
    }

    if (localAudio) {
      localAudio.stop();
      localAudio = null;
    }

    if (localVideo) {
      localVideo.stop();
      userVideo.removeChild(localVideoDiv);
      localVideo = null;
      localVideoDiv = null;
    }

    if (remoteMedia) {
      remoteVideo.removeChild(remoteVideoDiv);
      remoteMedia = null;
      remoteVideoDiv = null;
    }

    joinButton.disabled = false;
  }

  async function startLocalVideo() {
    initializeLocalMedias();
    await localVideo.start();
    localVideoDiv = localVideo.getView();
    userVideo.appendChild(localVideoDiv);

    if (!localMediaStarted) {
      await openSfuUpstreamConnection();
      localMediaStarted = true;
    }
    startLocalVideoButton.disabled = true;
}

  async function startLocalAudio() {
    initializeLocalMedias();
    await localAudio.start();
    if (!localMediaStarted) {
      await openSfuUpstreamConnection();
      localMediaStarted = true;
    }
    startLocalAudioButton.disabled = true;
  }

  // Event listeners for buttons
  joinButton.addEventListener("click", joinCall);
  leaveButton.addEventListener("click", leaveCall);
  startLocalVideoButton.addEventListener("click", startLocalVideo);
  startLocalAudioButton.addEventListener("click", startLocalAudio);
});