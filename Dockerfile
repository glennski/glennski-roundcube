# syntax=docker/dockerfile:1

# ---- build: PHP deps, JS deps and compiled CSS ------------------------------
FROM php:8.3-cli-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git make nodejs npm unzip libzip-dev \
        libfreetype6-dev libjpeg62-turbo-dev libpng-dev libicu-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" gd intl zip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
RUN make build \
    && rm -rf node_modules .git tests .ci .github \
              skins/elastic/node_modules plugins/*/node_modules

# ---- runtime ----------------------------------------------------------------
FROM php:8.3-apache-bookworm
ARG VERSION=dev
LABEL org.opencontainers.image.title="glennski-roundcube" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/glennski/glennski-roundcube"

RUN apt-get update && apt-get install -y --no-install-recommends \
        libfreetype6-dev libicu-dev libjpeg62-turbo-dev libldap2-dev libpng-dev \
        libpq-dev libsqlite3-dev libzip-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" exif gd intl ldap opcache pdo_mysql pdo_pgsql pdo_sqlite zip \
    && rm -rf /var/lib/apt/lists/* \
    && a2enmod rewrite headers expires deflate \
    && sed -ri 's!/var/www/html!/var/www/html/public_html!g' /etc/apache2/sites-available/*.conf \
    && sed -ri 's!/var/www/!/var/www/html/public_html/!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf \
    && sed -ri '/<Directory \/var\/www\/html\/public_html\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

COPY --from=build --chown=www-data:www-data /src /var/www/html
COPY docker/config.inc.php /var/www/html/config/config.inc.php
COPY docker/php.ini /usr/local/etc/php/conf.d/roundcube.ini
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

ENV ROUNDCUBE_DATA=/var/roundcube
VOLUME /var/roundcube
EXPOSE 80
ENTRYPOINT ["entrypoint.sh"]
CMD ["apache2-foreground"]
