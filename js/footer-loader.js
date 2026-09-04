(function () {
  fetch('/data/footer.json')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var el;

      // Footer address (short, one-line, linked)
      el = document.getElementById('footer-address');
      if (el && d.address) {
        el.innerHTML = d.map_url
          ? '<a href="' + d.map_url + '" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.9);text-decoration:none;">' + d.address + '</a>'
          : d.address;
      }

      // Contact page main-body address link
      el = document.getElementById('contact-address-link');
      if (el && d.address) {
        if (d.map_url) el.href = d.map_url;
        el.innerHTML = d.address.replace(/,\s*/g, ',<br>');
      }

      // Email
      el = document.getElementById('footer-email-link');
      if (el && d.email) {
        el.href = 'mailto:' + d.email;
        el.textContent = d.email;
      }

      // Phone
      el = document.getElementById('footer-phone-link');
      if (el && d.phone) {
        el.href = 'tel:' + d.phone.replace(/\s/g, '');
        el.textContent = d.phone;
      }
    })
    .catch(function () {});
})();
