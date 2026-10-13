// Black Hands Barber Shop — scripts da página principal
const track = document.getElementById("sliderTrack");
const slides = [...document.querySelectorAll(".slide")];
const dots = [...document.querySelectorAll(".dot")];

if (track && slides.length) {
  let currentSlide = 0, startX = 0, deltaX = 0, dragging = false, autoTimer;
  function showSlide(i){
    currentSlide = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    slides.forEach((s,n)=>s.classList.toggle("active",n===currentSlide));
    dots.forEach((d,n)=>d.classList.toggle("active",n===currentSlide));
  }
  document.getElementById("prevSlide")?.addEventListener("click",()=>showSlide(currentSlide-1));
  document.getElementById("nextSlide")?.addEventListener("click",()=>showSlide(currentSlide+1));
  dots.forEach(d=>d.addEventListener("click",()=>showSlide(Number(d.dataset.slide))));
  function restartAuto(){ clearInterval(autoTimer); autoTimer=setInterval(()=>showSlide(currentSlide+1),6000); }
  restartAuto();
  track.addEventListener("pointerdown", e=>{dragging=true;startX=e.clientX;deltaX=0;track.classList.add("dragging");clearInterval(autoTimer);track.setPointerCapture(e.pointerId);});
  track.addEventListener("pointermove", e=>{if(!dragging)return;deltaX=e.clientX-startX;track.style.transform=`translateX(calc(-${currentSlide*100}% + ${deltaX}px))`;});
  track.addEventListener("pointerup",()=>{if(!dragging)return;dragging=false;track.classList.remove("dragging");if(Math.abs(deltaX)>60)showSlide(currentSlide+(deltaX<0?1:-1));else showSlide(currentSlide);restartAuto();});
  track.addEventListener("pointercancel",()=>{dragging=false;track.classList.remove("dragging");showSlide(currentSlide);restartAuto();});
}

document.querySelectorAll(".plan button,.product button").forEach(btn=>btn.addEventListener("click",()=>alert("Esta área está preparada para a integração do Club/Loja.")));
