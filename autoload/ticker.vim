function! g:mcube_ticker_install(info) abort
    if a:info.status == 'installed' || a:info.force
        !npm install
        UpdateRemotePlugins
    endif
endfunction
