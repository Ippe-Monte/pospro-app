"""Creates tests/big-photo.jpg: a 6000x4500, ~13 MB JPEG like a phone camera photo (used by ui_test.py)."""
import os, numpy as np
from PIL import Image, ImageDraw
w,h=6000,4500; y,x=np.mgrid[0:h,0:w]; a=np.zeros((h,w,3),np.uint8); a[...,0]=x*255//w; a[...,1]=y*255//h; a[...,2]=128
a=np.clip(a.astype(int)+np.random.randint(0,60,(h,w,3)),0,255).astype(np.uint8)
im=Image.fromarray(a); d=ImageDraw.Draw(im); d.ellipse([2200,1450,3800,3050],fill=(250,200,40)); d.rectangle([0,0,600,h],fill=(220,30,30))
im.save(os.path.join(os.path.dirname(os.path.abspath(__file__)),'big-photo.jpg'),quality=95)
