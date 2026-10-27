import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { Camera, Image as ImageIcon, QrCode, Sparkles, RefreshCw, Send, Heart, Download, Zap, FlipHorizontal, X } from 'lucide-react';

export default function App() {
  const [view, setView] = useState('camera');
  const [guestName, setGuestName] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [quota, setQuota] = useState(15);
  const [uploading, setUploading] = useState(false);
  
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  
  const [facingMode, setFacingMode] = useState('environment');
  const [flashOn, setFlashOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hasFlash, setHasFlash] = useState(false);

  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);

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

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      setHasFlash(!!capabilities.torch);

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
      alert("Fitur Flash tidak didukung oleh perangkat ini.");
    }
  };

  const switchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    setFlashOn(false);
  };

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

      ctx.fillStyle = '#FEDB71'; // Accent Yellow Frame
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#140F1F'; // Dark Text
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('H A P P I LY   E V E R   A F T E R', canvas.width / 2, 65);

      const imgX = 70;
      const imgY = 100;
      const imgWidth = 660;
      const imgHeight = 740;

      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(20, 15, 31, 0.15)';
      ctx.shadowBlur = 20;
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

      ctx.fillStyle = '#140F1F';
      ctx.font = '26px serif';
      ctx.fillText('♡', canvas.width / 2, 890);

      ctx.font = 'italic 34px serif';
      ctx.fillStyle = '#140F1F';
      ctx.fillText('Wedding of Hani & Memed', canvas.width / 2, 945);

      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#4a4556';
      ctx.fillText('Photographer: ' + (guest || 'Tamu Undangan'), canvas.width / 2, 990);

      const link = document.createElement('a');
      link.download = `Wedding-Hani-Memed-${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    };
  };

  return (
    <div style={{ minHeight: '100dvh', width: '100vw', backgroundColor: '#140F1F', color: '#140F1F', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', margin: 0, padding: 0, overflowX: 'hidden' }}>
      
      <style>{`
        @keyframes floatSlow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(1.5deg); }
        }
        .animate-float {
          animation: floatSlow 4s ease-in-out infinite;
        }
        html {
          scroll-behavior: smooth;
        }
      `}</style>

      {/* WRAPPER UTAMA */}
      <div style={{ width: '100%', maxWidth: '480px', minHeight: '100dvh', backgroundColor: '#FCFAFS', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 0 40px rgba(20, 15, 31, 0.2)' }}>
        
        {/* HEADER ATAS */}
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFFFF', padding: '6px 14px', borderRadius: '20px', border: '1px solid #EBE7F0', boxShadow: '0 2px 8px rgba(20, 15, 31, 0.04)' }}>
            <span style={{ fontSize: '14px' }}>📸</span>
            <h2 style={{ fontSize: '14px', fontFamily: 'serif', color: '#140F1F', margin: 0, fontWeight: 'bold' }}>Hani & Memed</h2>
            <Heart style={{ width: '12px', height: '12px', color: '#FEDB71', fill: '#FEDB71' }} />
          </div>
          {isRegistered && view === 'camera' && (
            <div style={{ background: '#FEDB71', color: '#140F1F', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(254, 219, 113, 0.4)' }}>
              Sisa: {quota} 🎞️
            </div>
          )}
        </div>

        {/* KONTEN UTAMA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 16px 90px 16px', overflowY: 'auto' }}>
          
          {view === 'camera' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {!isRegistered ? (
                <div className="animate-float" style={{ background: '#FFFFFF', border: '1px solid #EBE7F0', padding: '28px 22px', borderRadius: '28px', textAlign: 'center', boxShadow: '0 12px 35px rgba(20, 15, 31, 0.06)', position: 'relative', overflow: 'hidden' }}>
                  
                  <div style={{ position: 'absolute', top: '10px', left: '15px', fontSize: '14px', opacity: 0.8 }}>💛</div>
                  <div style={{ position: 'absolute', top: '12px', right: '15px', fontSize: '14px', opacity: 0.8 }}>✨</div>

                  <div style={{ fontSize: '38px', marginBottom: '8px' }}>📷✨</div>
                  <h3 style={{ fontFamily: 'serif', fontSize: '22px', marginBottom: '6px', color: '#140F1F', fontWeight: 'bold' }}>Welcome to Wedding Camera</h3>
                  <p style={{ fontSize: '12px', color: '#68607A', marginBottom: '22px', lineHeight: '1.5' }}>Abadikan setiap momen spesial di hari bahagia bersama kami. Masukkan nama Anda untuk memulai.</p>
                  
                  <input 
                    type="text" 
                    placeholder="Ketik Nama Lengkap Anda..." 
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    style={{ width: '100%', background: '#FCFAFS', border: '2px solid #FEDB71', color: '#140F1F', padding: '14px', borderRadius: '16px', fontSize: '14px', textAlign: 'center', marginBottom: '16px', outline: 'none', boxSizing: 'border-box', fontWeight: 'bold' }}
                  />
                  
                  <button 
                    onClick={() => { if(guestName.trim()) setIsRegistered(true); else alert('Mohon isi nama terlebih dahulu!'); }}
                    style={{ width: '100%', background: '#FEDB71', color: '#140F1F', border: 'none', padding: '14px', borderRadius: '16px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', boxShadow: '0 6px 20px rgba(254, 219, 113, 0.4)', transition: '0.2s' }}
                  >
                    Mulai Memotret →
                  </button>
                  
                  <div style={{ marginTop: '16px', fontSize: '11px', color: '#68607A' }}>
                    💛 Terima kasih sudah menjadi bagian dari hari istimewa kami!
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
                  
                  {!photo ? (
                    <div style={{ flex: 1, position: 'relative', width: '100%', backgroundColor: '#000000', borderRadius: '28px', overflow: 'hidden', border: '3px solid #FEDB71', minHeight: '420px', boxShadow: '0 10px 30px rgba(20,15,31,0.15)' }}>
                      <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      
                      <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px', zIndex: 20 }}>
                        <button 
                          onClick={toggleFlash}
                          style={{ background: flashOn ? '#FEDB71' : 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.3)', color: flashOn ? '#140F1F' : 'white', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                        >
                          <Zap style={{ width: '16px', height: '16px', fill: flashOn ? '#140F1F' : 'none' }} />
                        </button>

                        <button 
                          onClick={switchCamera}
                          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                        >
                          <FlipHorizontal style={{ width: '16px', height: '16px' }} />
                        </button>
                      </div>

                      <div style={{ position: 'absolute', top: '16px', left: '16px', display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '20px', backdropFilter: 'blur(4px)', zIndex: 20 }}>
                        {[0.5, 1, 2].map((lvl) => (
                          <button
                            key={lvl}
                            onClick={() => handleZoomChange(lvl)}
                            style={{ background: zoomLevel === lvl ? '#FEDB71' : 'transparent', color: zoomLevel === lvl ? '#140F1F' : 'white', border: 'none', padding: '4px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            {lvl}x
                          </button>
                        ))}
                      </div>

                      <button 
                        onClick={capturePhoto} 
                        style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', width: '74px', height: '74px', background: '#FFFFFF', borderRadius: '50%', border: '4px solid #FEDB71', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 25px rgba(20, 15, 31, 0.4)', zIndex: 20 }}
                      >
                        <div style={{ width: '56px', height: '56px', background: '#FEDB71', borderRadius: '50%' }}></div>
                      </button>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '100%', flex: 1, maxHeight: '70vh', borderRadius: '28px', overflow: 'hidden', border: '3px solid #FEDB71', marginBottom: '14px', boxShadow: '0 10px 30px rgba(20, 15, 31, 0.15)', background: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={photo} alt="Hasil" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                        <button onClick={() => setPhoto(null)} style={{ flex: 1, background: '#FFFFFF', color: '#140F1F', border: '1px solid #EBE7F0', padding: '12px', borderRadius: '14px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Ulangi Foto</button>
                        <button onClick={sendPhotoToGallery} disabled={uploading} style={{ flex: 1, background: '#FEDB71', color: '#140F1F', border: 'none', padding: '12px', borderRadius: '14px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 4px 15px rgba(254, 219, 113, 0.4)' }}>
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
              <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                <h3 style={{ fontFamily: 'serif', fontSize: '20px', color: '#140F1F', marginBottom: '4px', fontWeight: 'bold' }}>Galeri Momen Pernikahan</h3>
                <p style={{ fontSize: '11px', color: '#68607A' }}>Ketuk foto untuk melihat dan mengunduh dengan frame.</p>
              </div>
              
              {photos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#68607A', fontSize: '13px' }}>Belum ada foto yang dibagikan. Jadilah yang pertama!</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {photos.map((item) => (
                    <div 
                      key={item.id} 
                      onClick={() => setSelectedPhoto(item)}
                      style={{ background: '#FFFFFF', border: '1px solid #EBE7F0', borderRadius: '20px', overflow: 'hidden', textAlign: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(20, 15, 31, 0.05)', transition: 'transform 0.2s', display: 'flex', flexDirection: 'column' }}
                    >
                      <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden' }}>
                        <img src={item.image_url} alt="Foto Tamu" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ padding: '6px 4px', background: '#FEDB71', fontSize: '10px', color: '#140F1F', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderTop: '1px solid #f6d062' }}>
                        {item.guest_name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'admin' && (
            <div className="animate-float" style={{ background: '#FFFFFF', border: '1px solid #EBE7F0', padding: '28px 20px', borderRadius: '28px', textAlign: 'center', margin: 'auto', width: '100%', maxWidth: '360px', boxShadow: '0 12px 35px rgba(20, 15, 31, 0.08)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '12px', left: '15px', fontSize: '14px', opacity: 0.8 }}>💛</div>
              <div style={{ position: 'absolute', top: '12px', right: '15px', fontSize: '14px', opacity: 0.8 }}>✨</div>

              <QrCode style={{ width: '36px', height: '36px', color: '#140F1F', margin: '0 auto 12px' }} />
              <h3 style={{ fontFamily: 'serif', fontSize: '20px', marginBottom: '6px', color: '#140F1F', fontWeight: 'bold' }}>QR Code Meja Tamu</h3>
              <p style={{ fontSize: '12px', color: '#68607A', marginBottom: '20px', lineHeight: '1.4' }}>Scan QR Code ini menggunakan kamera HP untuk mulai mengambil foto di meja Anda.</p>
              <div style={{ background: '#FEDB71', padding: '16px', borderRadius: '20px', display: 'inline-block', marginBottom: '16px', boxShadow: '0 6px 20px rgba(254, 219, 113, 0.3)', border: '2px solid #140F1F' }}>
                <QRCodeSVG value="https://wedding-camera-sandy.vercel.app" size={150} />
              </div>
              <div style={{ fontSize: '10px', color: '#68607A', wordBreak: 'break-all' }}>https://wedding-camera-sandy.vercel.app</div>
            </div>
          )}

        </div>

        {/* POPUP PREVIEW FOTO ALA LOCKET (DENGAN BACKGROUND BLUR) */}
        {selectedPhoto && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(20, 15, 31, 0.65)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ backgroundColor: '#FFFFFF', border: '2px solid #EBE7F0', borderRadius: '32px', padding: '20px', width: '100%', maxWidth: '360px', textAlign: 'center', boxShadow: '0 20px 40px rgba(20, 15, 31, 0.25)', position: 'relative' }} className="animate-float">
              
              <button 
                onClick={() => setSelectedPhoto(null)}
                style={{ position: 'absolute', top: '16px', right: '16px', background: '#FCFAFS', color: '#140F1F', border: '1px solid #EBE7F0', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X style={{ width: '18px', height: '18px' }} />
              </button>

              <h3 style={{ fontFamily: 'serif', fontSize: '18px', color: '#140F1F', marginBottom: '12px', fontWeight: 'bold' }}>Momen Spesial</h3>

              <div style={{ backgroundColor: '#FCFAFS', border: '1px solid #EBE7F0', borderRadius: '24px', padding: '12px', marginBottom: '16px', boxShadow: '0 8px 20px rgba(20, 15, 31, 0.05)' }}>
                <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: '16px', overflow: 'hidden', marginBottom: '10px' }}>
                  <img src={selectedPhoto.image_url} alt="Detail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ fontSize: '13px', color: '#140F1F', fontWeight: 'bold' }}>
                  📸 Uploaded by <span style={{ textDecoration: 'underline', color: '#b89224' }}>{selectedPhoto.guest_name}</span>
                </div>
              </div>

              <button 
                onClick={() => {
                  handleDownloadWithFrame(selectedPhoto.image_url, selectedPhoto.guest_name);
                }}
                style={{ width: '100%', background: '#FEDB71', color: '#140F1F', border: 'none', padding: '14px', borderRadius: '16px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 6px 20px rgba(254, 219, 113, 0.4)' }}
              >
                <Download style={{ width: '16px', height: '16px' }} /> Download Foto (Ber-Frame) 🎞️
              </button>

            </div>
          </div>
        )}

        {/* BOTTOM NAVIGATION DOCK */}
        <div style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '420px', backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(12px)', borderRadius: '32px', padding: '8px 16px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', border: '1px solid #EBE7F0', boxShadow: '0 10px 30px rgba(20, 15, 31, 0.1)', zIndex: 100 }}>
          
          <button 
            onClick={() => setView('admin')}
            style={{ background: view === 'admin' ? '#FEDB71' : 'transparent', color: '#140F1F', border: 'none', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }}
            title="QR Code"
          >
            <QrCode style={{ width: '20px', height: '20px' }} />
          </button>

          <button 
            onClick={() => setView('camera')}
            style={{ background: view === 'camera' ? '#FEDB71' : 'transparent', color: '#140F1F', border: 'none', width: '52px', height: '52px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: view === 'camera' ? '0 4px 15px rgba(254, 219, 113, 0.5)' : 'none', transition: '0.2s' }}
            title="Kamera"
          >
            <Camera style={{ width: '24px', height: '24px' }} />
          </button>

          <button 
            onClick={() => setView('gallery')}
            style={{ background: view === 'gallery' ? '#FEDB71' : 'transparent', color: '#140F1F', border: 'none', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', transition: '0.2s' }}
            title="Galeri"
          >
            <ImageIcon style={{ width: '20px', height: '20px' }} />
            {photos.length > 0 && (
              <span style={{ position: 'absolute', top: '4px', right: '4px', background: '#FEDB71', color: '#140F1F', fontSize: '9px', fontWeight: 'bold', width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #140F1F' }}>
                {photos.length}
              </span>
            )}
          </button>

        </div>

      </div>
    </div>
  );
}