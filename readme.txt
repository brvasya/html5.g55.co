gltfpack.exe -i m.glb -o m_small.glb -cc -kn
ffmpeg.exe -y -i s.wav -ac 1 -ar 22050 -c:a libvorbis -qscale:a 0 s.ogg
powershell -Command "[Convert]::ToBase64String([IO.File]::ReadAllBytes('m_small.glb'))" > m_base64.txt
powershell -Command "[Convert]::ToBase64String([IO.File]::ReadAllBytes('s.ogg'))" > s_base64.txt