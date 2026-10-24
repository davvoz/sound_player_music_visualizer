; Removes the registry keys written by Aurora Player (assoc.js) on uninstall.
; Keep in sync with formats.js.
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\AuroraPlayer.Audio"
  DeleteRegKey HKCU "Software\Classes\AuroraPlayer.Video"
  DeleteRegKey HKCU "Software\Classes\AuroraPlayer.Playlist"
  DeleteRegKey HKCU "Software\AuroraPlayer"
  DeleteRegKey HKCU "Software\Classes\Applications\Aurora Player.exe"
  DeleteRegValue HKCU "Software\RegisteredApplications" "AuroraPlayer"

  DeleteRegValue HKCU "Software\Classes\.mp3\OpenWithProgids" "AuroraPlayer.Audio"
  DeleteRegValue HKCU "Software\Classes\.wav\OpenWithProgids" "AuroraPlayer.Audio"
  DeleteRegValue HKCU "Software\Classes\.ogg\OpenWithProgids" "AuroraPlayer.Audio"
  DeleteRegValue HKCU "Software\Classes\.oga\OpenWithProgids" "AuroraPlayer.Audio"
  DeleteRegValue HKCU "Software\Classes\.opus\OpenWithProgids" "AuroraPlayer.Audio"
  DeleteRegValue HKCU "Software\Classes\.flac\OpenWithProgids" "AuroraPlayer.Audio"
  DeleteRegValue HKCU "Software\Classes\.m4a\OpenWithProgids" "AuroraPlayer.Audio"
  DeleteRegValue HKCU "Software\Classes\.aac\OpenWithProgids" "AuroraPlayer.Audio"
  DeleteRegValue HKCU "Software\Classes\.weba\OpenWithProgids" "AuroraPlayer.Audio"

  DeleteRegValue HKCU "Software\Classes\.mp4\OpenWithProgids" "AuroraPlayer.Video"
  DeleteRegValue HKCU "Software\Classes\.m4v\OpenWithProgids" "AuroraPlayer.Video"
  DeleteRegValue HKCU "Software\Classes\.webm\OpenWithProgids" "AuroraPlayer.Video"
  DeleteRegValue HKCU "Software\Classes\.mkv\OpenWithProgids" "AuroraPlayer.Video"
  DeleteRegValue HKCU "Software\Classes\.mov\OpenWithProgids" "AuroraPlayer.Video"
  DeleteRegValue HKCU "Software\Classes\.ogv\OpenWithProgids" "AuroraPlayer.Video"

  DeleteRegValue HKCU "Software\Classes\.m3u\OpenWithProgids" "AuroraPlayer.Playlist"
  DeleteRegValue HKCU "Software\Classes\.m3u8\OpenWithProgids" "AuroraPlayer.Playlist"
!macroend
