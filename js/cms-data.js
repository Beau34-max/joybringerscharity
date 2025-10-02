async function loadData(file) {
  const res = await fetch(file);
  return res.json();
}

document.addEventListener("DOMContentLoaded", async () => {
  // HERO
  const hero = await loadData("data/hero.json");
  document.querySelector(".hero-title").innerText = hero.title;
  document.querySelector(".hero-charity").innerText = hero.charity_number;
  const heroButtons = document.querySelector(".hero-buttons");
  heroButtons.innerHTML = "";
  hero.buttons.forEach(btn => {
    heroButtons.innerHTML += `<a href="${btn.link}" class="btn ${btn.style} px-4 py-3">${btn.text}</a>`;
  });

  // IMPACT
  const impact = await loadData("data/impact.json");
  document.querySelector(".impact-count").innerText = impact.young_people_supported;
  document.querySelector(".impact-donation").innerText = impact.donation_message;
  document.querySelector(".impact-volunteer").innerText = impact.volunteer_message;

  // PROGRAMMES
  const programmes = await loadData("data/programmes.json");
  const progWrap = document.querySelector(".programmes");
  progWrap.innerHTML = "";
  programmes.items.forEach(p => {
    progWrap.innerHTML += `
      <div class="cause-entry">
        <a class="img" style="background-image:url(${p.image});"></a>
        <div class="text p-3 p-md-4">
          <h3>${p.title}</h3>
          <p>${p.description}</p>
        </div>
      </div>`;
  });

  // EVENTS
  const events = await loadData("data/events.json");
  const eventWrap = document.querySelector(".events");
  eventWrap.innerHTML = "";
  events.items.forEach(e => {
    eventWrap.innerHTML += `
      <div class="blog-entry">
        <a class="block-20" style="background-image:url(${e.image});"></a>
        <div class="text p-4">
          <h3>${e.title}</h3>
          <p>${e.description}</p>
          <p><a href="${e.link}">Join Event</a></p>
        </div>
      </div>`;
  });

  // PARTNERS
  const partners = await loadData("data/partners.json");
  const partnerWrap = document.querySelector(".partners");
  partnerWrap.innerHTML = "";
  partners.items.forEach(p => {
    partnerWrap.innerHTML += `<img src="${p.logo}" alt="${p.name}" class="img-fluid mb-3">`;
  });

  // FOOTER
  const footer = await loadData("data/footer.json");
  document.querySelector(".footer-email").innerText = footer.email;
  document.querySelector(".footer-phone").innerText = footer.phone;
  document.querySelector(".footer-company").innerText = footer.company;
  document.querySelector(".footer-company-no").innerText = footer.company_no;
  document.querySelector(".footer-charity-no").innerText = footer.charity_no;
});
