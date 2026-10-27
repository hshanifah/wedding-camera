import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { Camera, Image as ImageIcon, QrCode, Sparkles, RefreshCw, Send, Heart, Download, Zap, FlipHorizontal } from 'lucide-react';

export default function App() {
  const [view, setView] = useState('camera');
  const [guestName, setGuestName] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [quota, setQuota] = useState(15);
  const [uploading, setUploading] = useState(false);
  
  // State Kontrol Kamera Tambahan
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (belakang) | 'user' (depan)
  const [flashOn, setFlashOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1); // 0.5x, 1x, 2x
  const [hasFlash, setHasFlash] = useState(false);
  const [hasZoom, setHasZoom] = useState(false);

  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  // Ambil galeri foto dari Supabase
  const fetchPhotos = async () => {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setPhotos(data);
  };

  useEffect(() => {
    fetchPhotos();
    const channel = supabase
      .channel('public:photos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, (payload) => {
        setPhotos((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Memulai Kamera dengan Settingan Dinamis (Flash, FacingMode, Zoom)
  const startCamera = async () => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Cek kapabilitas hardware track (Flash & Zoom)
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      
      setHasFlash(!!capabilities.torch);
      setHasZoom(!!capabilities.zoom);

    } catch (err) {
      console.error("Gagal mengakses kamera:", err);
    }
  };

  useEffect(() => {
    if (isRegistered && view === 'camera' && !photo) {
      startCamera();
    }
    return () => {
      if (mediaStreamRef.current && (!isRegistered || view !== 'camera')) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isRegistered, view, photo, facingMode]);

  // Fungsi Toggle Flash (Obor)
  const toggleFlash = async () => {
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    try {
      const newFlashState = !flashOn;
      await track.applyConstraints({
        advanced: [{ torch: newFlashState }]
      });
      setFlashOn(newFlashState);
    } catch (err) {
      console.error("Flash tidak didukung di perangkat ini", err);
      alert("Fitur Flash tidak didukung oleh browser/perangkat ini.");
    }
  };

  // Fungsi Ganti Kamera (Depan / Belakang)
  const switchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    setFlashOn(false);
  };

  // Fungsi Atur Zoom (0.5x, 1x, 2x)
  const handleZoomChange = async (level) => {
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    
    if (capabilities.zoom) {
      try {
        const minZ = capabilities.zoom.min || 1;
        const maxZ = capabilities.zoom.max || 2;
        let targetZoom = level === 0.5 ? minZ : level === 2 ? maxZ : 1;
        
        await track.applyConstraints({
          advanced: [{ zoom: targetZoom }]
        });
        setZoomLevel(level);
      } catch (err) {
        console.error("Gagal mengubah zoom", err);
      }
    } else {
      setZoomLevel(level);
    }
  };

  const capturePhoto = () => {
    if (quota <= 0) {
      alert("Kuota jepretan Anda sudah habis!");
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 720;
    canvas.height = videoRef.current.videoHeight || 1280;
    const ctx = canvas.getContext('2d');
    
    // Jika kamera depan, balikkan gambar agar tidak mirror
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    setPhoto(canvas.toDataURL('image/jpeg'));
    setQuota((prev) => prev - 1);
  };

  const sendPhotoToGallery = async () => {
    if (!photo) return;
    setUploading(true);
    try {
      const res = await fetch(photo);
      const blob = await res.blob();
      const fileName = `wedding_${Date.now()}.jpg`;
      const filePath = `public/${fileName}`;

      const { error: storageError } = await supabase.storage
        .from('wedding-photos')
        .upload(filePath, blob);

      if (storageError) throw storageError;

      const { data: publicURLData } = supabase.storage
        .from('wedding-photos')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('photos')
        .insert([{ guest_name: guestName, image_url: publicURLData.publicUrl }]);

      if (dbError) throw dbError;

      alert("Yeay! Foto berhasil dibagikan ke galeri! ✨");
      setPhoto(null);
      setView('gallery');
    } catch (error) {
      console.error(error);
      const newEntry = {
        id: Date.now(),
        guest_name: guestName,
        image_url: photo,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setPhotos((prev) => [newEntry, ...prev]);
      setPhoto(null);
      setView('gallery');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadWithFrame = (imageUrl, guest) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = 800;
      canvas.height = 1050;

      ctx.fillStyle = '#FDFBF7';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#292524';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('H A P P I LY   E V E R   A F T E R', canvas.width / 2, 65);

      const imgX = 70;
      const imgY = 100;
      const imgWidth = 660;
      const imgHeight = 740;

      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      ctx.shadowBlur = 15;
      ctx.fillRect(imgX, imgY, imgWidth, imgHeight);
      ctx.restore();

      const hRatio = imgWidth / img.width;
      const vRatio = imgHeight / img.height;
      const ratio = Math.max(hRatio, vRatio);
      const centerShiftX = (imgWidth - img.width * ratio) / 2;
      const centerShiftY = (imgHeight - img.height * ratio) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(imgX, imgY, imgWidth, imgHeight);
      ctx.clip();
      ctx.drawImage(img, 0, 0, img.width, img.height, imgX + centerShiftX, imgY + centerShiftY, img.width * ratio, img.height * ratio);
      ctx.restore();

      ctx.fillStyle = '#1c1917';
      ctx.font = '24px serif';
      ctx.fillText('♡', canvas.width / 2, 890);

      ctx.font = 'italic 32px serif';
      ctx.fillStyle = '#1c1917';
      ctx.fillText('Wedding of Hani & Memed', canvas.width / 2, 945);

      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#78716c';
      ctx.fillText('Photographer: ' + (guest || 'Tamu Undangan'), canvas.width / 2, 990);

      const link = document.createElement('a');
      link.download = `Wedding-Hani-Memed-${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    };
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#050505', color: '#f5f5f4', fontFamily: 'sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: 0, padding: 0 }}>
      
      {/* Container utama dirancang agar memenuhi layar penuh (full-screen) di HP */}
      <div style={{ width: '100%', maxWidth: '480px', height: '100vh', maxHeight: '100vh', backgroundColor: '#09090b', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f1f23', backgroundColor: '#09090b', zIndex: 50, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Heart style={{ width: '16px', height: '16px', color: '#f43f5e', fill: '#f43f5e' }} />
            <h2 style={{ fontSize: '15px', fontFamily: 'serif', color: '#fbcfe8', margin: 0 }}>Hani & Memed</h2>
          </div>
          <div style={{ display: 'flex', gap: '4px', background: '#18181b', padding: '3px', borderRadius: '20px', border: '1px solid #27272a' }}>
            <button onClick={() => setView('camera')} style={{ background: view === 'camera' ? '#e11d48' : 'transparent', color: view === 'camera' ? 'white' : '#a1a1aa', border: 'none', padding: '4px 10px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer', fontWeight: '500' }}>Kamera</button>
            <button onClick={() => setView('gallery')} style={{ background: view === 'gallery' ? '#e11d48' : 'transparent', color: view === 'gallery' ? 'white' : '#a1a1aa', border: 'none', padding: '4px 10px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer', fontWeight: '500' }}>Galeri ({photos.length})</button>
            <button onClick={() => setView('admin')} style={{ background: view === 'admin' ? '#e11d48' : 'transparent', color: view === 'admin' ? 'white' : '#a1a1aa', border: 'none', padding: '4px 10px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer', fontWeight: '500' }}>QR</button>
          </div>
        </div>

        {/* Konten Fleksibel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px', overflow: 'hidden' }}>
          
          {view === 'camera' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              {!isRegistered ? (
                <div style={{ background: '#121216', border: '1px solid #27272a', padding: '24px 20px', borderRadius: '24px', margin: 'auto', width: '100%', maxWidth: '360px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                  <Sparkles style={{ width: '32px', height: '32px', color: '#f43f5e', margin: '0 auto 14px' }} />
                  <h3 style={{ fontFamily: 'serif', fontSize: '20px', marginBottom: '8px', color: '#fbcfe8' }}>Wedding Disposable Camera</h3>
                  <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '20px', lineHeight: '1.5' }}>Masukkan nama Anda untuk mulai mengabadikan momen di pernikahan Hani & Memed.</p>
                  <input 
                    type="text" 
                    placeholder="Ketik Nama Lengkap Anda..." 
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    style={{ width: '100%', background: '#09090b', border: '1px solid #3f3f46', color: 'white', padding: '12px', borderRadius: '12px', fontSize: '14px', textAlign: 'center', marginBottom: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button 
                    onClick={() => { if(guestName.trim()) setIsRegistered(true); else alert('Mohon isi nama terlebih dahulu!'); }}
                    style={{ width: '100%', background: '#e11d48', color: 'white', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
                  >
                    Mulai Memotret 📸
                  </button>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
                  
                  {/* Bar Informasi Atas Kamera */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '11px', color: '#a1a1aa', flexShrink: 0 }}>
                    <span>Fotografer: <strong style={{ color: '#fbcfe8' }}>{guestName}</strong></span>
                    <span style={{ background: '#18181b', border: '1px solid #27272a', padding: '3px 8px', borderRadius: '10px', color: '#f43f5e', fontWeight: 'bold' }}>Sisa: {quota} 🎞️</span>
                  </div>
                  
                  {!photo ? (
                    <div style={{ flex: 1, position: 'relative', width: '100%', background: 'black', borderRadius: '20px', overflow: 'hidden', border: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      
                      {/* TOMBOL KONTROL KAMERA (FLASH & SWITCH & ZOOM) */}
                      <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px', zIndex: 10 }}>
                        {/* Tombol Flash */}
                        <button 
                          onClick={toggleFlash}
                          style={{ background: flashOn ? '#e11d48' : 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                          title="Flash"
                        >
                          <Zap style={{ width: '18px', height: '18px', fill: flashOn ? 'white' : 'none' }} />
                        </button>

                        {/* Tombol Putar Kamera */}
                        <button 
                          onClick={switchCamera}
                          style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                          title="Putar Kamera"
                        >
                          <FlipHorizontal style={{ width: '18px', height: '18px' }} />
                        </button>
                      </div>

                      {/* TOMBOL ZOOM (0.5x, 1x, 2x) */}
                      <div style={{ position: 'absolute', bottom: '90px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '20px', backdropFilter: 'blur(4px)', zIndex: 10 }}>
                        {[0.5, 1, 2].map((lvl) => (
                          <button
                            key={lvl}
                            onClick={() => handleZoomChange(lvl)}
                            style={{ background: zoomLevel === lvl ? '#e11d48' : 'transparent', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            {lvl}x
                          </button>
                        ))}
                      </div>

                      {/* TOMBOL JEPRET UTAMA */}
                      <button 
                        onClick={capturePhoto} 
                        style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', width: '64px', height: '64px', background: 'white', borderRadius: '50%', border: '4px solid #d4d4d8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(0,0,0,0.6)', zIndex: 10 }}
                      >
                        <div style={{ width: '48px', height: '48px', background: '#e11d48', borderRadius: '50%' }}></div>
                      </button>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                      <div style={{ width: '100%', flex: 1, maxHeight: '75vh', borderRadius: '20px', overflow: 'hidden', border: '1px solid #27272a', marginBottom: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'black' }}>
                        <img src={photo} alt="Hasil" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '10px', width: '100%', flexShrink: 0 }}>
                        <button onClick={() => setPhoto(null)} style={{ flex: 1, background: '#18181b', color: 'white', border: '1px solid #27272a', padding: '12px', borderRadius: '14px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>Ulangi Foto</button>
                        <button onClick={sendPhotoToGallery} disabled={uploading} style={{ flex: 1, background: '#e11d48', color: 'white', border: 'none', padding: '12px', borderRadius: '14px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                          {uploading ? 'Mengirim...' : 'Kirim ke Galeri ✨'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {view === 'gallery' && (
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontFamily: 'serif', fontSize: '18px', color: '#fbcfe8', marginBottom: '4px' }}>Galeri Momen Pernikahan</h3>
                <p style={{ fontSize: '11px', color: '#a1a1aa' }}>Kumpulan foto candid spesial dari para tamu.</p>
              </div>
              
              {photos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#71717a', fontSize: '13px' }}>Belum ada foto yang dibagikan.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {photos.map((item) => (
                    <div key={item.id} style={{ background: '#121216', border: '1px solid #27272a', borderRadius: '14px', overflow: 'hidden', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <img src={item.image_url} alt="Foto Tamu" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
                        <div style={{ padding: '6px 8px 2px', fontSize: '10px', color: '#d4d4d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          📸 <span style={{ color: '#fbcfe8', fontWeight: 'bold' }}>{item.guest_name}</span>
                        </div>
                      </div>
                      <div style={{ padding: '0 8px 8px' }}>
                        <button 
                          onClick={() => handleDownloadWithFrame(item.image_url, item.guest_name)}
                          style={{ width: '100%', background: '#1f1f23', color: '#fbcfe8', border: '1px solid #3f3f46', padding: '6px', borderRadius: '8px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: 'bold' }}
                        >
                          <Download style={{ width: '10px', height: '10px' }} /> Simpan 🎞️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'admin' && (
            <div style={{ background: '#121216', border: '1px solid #27272a', padding: '24px 16px', borderRadius: '24px', textAlign: 'center', margin: 'auto', width: '100%', maxWidth: '360px' }}>
              <QrCode style={{ width: '32px', height: '32px', color: '#f43f5e', margin: '0 auto 12px' }} />
              <h3 style={{ fontFamily: 'serif', fontSize: '18px', marginBottom: '6px', color: '#fbcfe8' }}>QR Code Meja Tamu</h3>
              <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '16px', lineHeight: '1.4' }}>Scan QR Code ini menggunakan kamera HP untuk mulai mengambil foto di meja Anda.</p>
              <div style={{ background: 'white', padding: '14px', borderRadius: '14px', display: 'inline-block', marginBottom: '14px', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
                <QRCodeSVG value="http://localhost:5173" size={150} />
              </div>
              <div style={{ fontSize: '10px', color: '#71717a', wordBreak: 'break-all' }}>http://localhost:5173</div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}